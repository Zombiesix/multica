import fs from "node:fs";
import path from "node:path";
import * as ts from "typescript";
import { parse as parseSfc } from "@vue/compiler-sfc";

export interface ScriptSource {
  code: string;
  /** 该段代码在原文件中的起始行（1-based 偏移量），用于把行号还原到原文件 */
  lineOffset: number;
}

export interface SfcParts {
  script: ScriptSource | null;
  template: string | null;
}

/** 一次解析拿到 script 与 template 两段；非 .vue 只返回 script */
export function readSfcParts(absFile: string): SfcParts {
  let raw: string;
  try {
    raw = fs.readFileSync(absFile, "utf8");
  } catch {
    return { script: null, template: null };
  }

  if (path.extname(absFile).toLowerCase() !== ".vue") {
    return { script: { code: raw, lineOffset: 0 }, template: null };
  }

  const { descriptor, errors } = parseSfc(raw, { filename: absFile });
  if (errors.length > 0) return { script: null, template: null };

  const block = descriptor.scriptSetup ?? descriptor.script;
  return {
    script: block ? { code: block.content, lineOffset: block.loc.start.line - 1 } : null,
    template: descriptor.template?.content ?? null,
  };
}

/** 读出可解析的脚本源码；.vue 走 SFC 解析取 script/script setup 块 */
export function readScript(absFile: string): ScriptSource | null {
  return readSfcParts(absFile).script;
}

export function createSource(code: string, fileName: string): ts.SourceFile {
  return ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function keyNameOf(name: ts.PropertyName): string | null {
  if (ts.isIdentifier(name)) return name.text;
  if (ts.isStringLiteral(name) || ts.isNoSubstitutionTemplateLiteral(name)) return name.text;
  return null;
}

export function getProp(obj: ts.ObjectLiteralExpression, name: string): ts.PropertyAssignment | null {
  for (const p of obj.properties) {
    if (!ts.isPropertyAssignment(p)) continue;
    if (keyNameOf(p.name) === name) return p;
  }
  return null;
}

export function stringValue(node: ts.Node | undefined): string | null {
  if (!node) return null;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;

  // 模板字符串：把 ${...} 原样留成占位符，这样 RESTful 路径（.../delete/${id}）
  // 也能看出形状，而不是整条丢掉
  if (ts.isTemplateExpression(node)) {
    let out = node.head.text;
    for (const span of node.templateSpans) {
      out += `{${expressionText(span.expression)}}${span.literal.text}`;
    }
    return out;
  }

  return null;
}

function expressionText(node: ts.Node): string {
  try {
    return node.getText();
  } catch {
    return "?";
  }
}

export function boolValue(node: ts.Node | undefined): boolean | null {
  if (!node) return null;
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  return null;
}

/** 取出 `() => import("x")` 或 `import("x")` 里的模块说明符 */
export function dynamicImportSpecifier(node: ts.Node | undefined): string | null {
  if (!node) return null;
  let call: ts.Node = node;
  if (ts.isArrowFunction(node)) call = node.body;
  if (ts.isParenthesizedExpression(call)) call = call.expression;
  if (!ts.isCallExpression(call)) return null;
  if (call.expression.kind !== ts.SyntaxKind.ImportKeyword) return null;
  return stringValue(call.arguments[0]);
}

/**
 * 把 `@/xxx` 别名或相对路径还原成 repo 相对路径（正斜杠）。
 * 裸模块名（第三方包）返回 null。
 */
export function resolveSpecifier(
  spec: string,
  fromFileAbs: string,
  repoRoot: string,
  srcDirRel: string | null,
): string | null {
  let abs: string;
  if (spec.startsWith("@/")) {
    const base = srcDirRel ? path.join(repoRoot, srcDirRel) : repoRoot;
    abs = path.join(base, spec.slice(2));
  } else if (spec.startsWith(".")) {
    abs = path.resolve(path.dirname(fromFileAbs), spec);
  } else {
    return null;
  }
  return path.relative(repoRoot, abs).split(path.sep).join("/");
}

/** 遍历所有 ImportDeclaration，回调 (模块说明符, 导入名列表, 该声明所在行) */
export function forEachImport(
  sf: ts.SourceFile,
  cb: (spec: string, names: string[], line: number) => void,
): void {
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt)) continue;
    const spec = stringValue(stmt.moduleSpecifier);
    if (!spec) continue;

    const names: string[] = [];
    const clause = stmt.importClause;
    // `import type { X }` 整条是类型，不该混进函数引用
    if (clause && !clause.isTypeOnly) {
      if (clause.name) names.push(clause.name.text);
      const bindings = clause.namedBindings;
      if (bindings) {
        if (ts.isNamedImports(bindings)) {
          // 用 propertyName（原始导出名），否则 `import { a as b }` 会记成 b，
          // 后面拿它去对 api 函数名就对不上
          for (const el of bindings.elements) {
            if (el.isTypeOnly) continue; // `import { type X }`
            names.push((el.propertyName ?? el.name).text);
          }
        } else if (ts.isNamespaceImport(bindings)) {
          names.push(`* as ${bindings.name.text}`);
        }
      }
    }

    const line = sf.getLineAndCharacterOfPosition(stmt.getStart(sf)).line + 1;
    cb(spec, names, line);
  }
}

/** 收集导出的函数/常量名，用于 API 域的函数清单 */
export function collectExports(sf: ts.SourceFile): string[] {
  const names = new Set<string>();

  const addFromBindingName = (name: ts.BindingName): void => {
    if (ts.isIdentifier(name)) {
      names.add(name.text);
      return;
    }
    for (const el of name.elements) {
      if (ts.isBindingElement(el)) addFromBindingName(el.name);
    }
  };

  for (const stmt of sf.statements) {
    const mods = ts.canHaveModifiers(stmt) ? ts.getModifiers(stmt) : undefined;
    const isExported = mods?.some(m => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;

    if (ts.isFunctionDeclaration(stmt) && stmt.name) {
      if (isExported || mods?.some(m => m.kind === ts.SyntaxKind.DefaultKeyword)) {
        names.add(stmt.name.text);
      }
      continue;
    }
    if (ts.isVariableStatement(stmt)) {
      if (!isExported) continue;
      for (const d of stmt.declarationList.declarations) addFromBindingName(d.name);
      continue;
    }
    if (ts.isExportDeclaration(stmt) && stmt.exportClause) {
      if (ts.isNamedExports(stmt.exportClause)) {
        for (const el of stmt.exportClause.elements) names.add(el.name.text);
      }
      continue;
    }
  }

  return [...names].sort();
}
