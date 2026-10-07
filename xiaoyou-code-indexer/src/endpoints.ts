import * as ts from "typescript";
import {
  type ScriptSource,
  createSource,
  resolveSpecifier,
  stringValue,
} from "./ast";
import type { Endpoint } from "./endpoint-types";
import { toRepoRel } from "./ignore";

export interface EndpointExtraction {
  endpoints: Endpoint[];
  /**
   * 有导出但不打后端的函数。实测多数是纯工具函数（如日期计算），
   * 不是提取失败；少数可能走了二次封装，值得人工看一眼。
   */
  nonEndpointFns: string[];
}

function urlPrefixOf(url: string): string {
  const first = url.replace(/^\/+/, "").split("/")[0];
  return first || "";
}

/**
 * 找出该文件里绑到共享 http 客户端的局部名。
 * 认的是「解析结果落在 clientFiles 里」而不是写死 `$http` 这个名字，
 * 这样别名 import 或换了变量名也不会漏。
 */
function clientBindings(
  sf: ts.SourceFile,
  absFile: string,
  repoRoot: string,
  srcDirRel: string | null,
  clientFiles: Set<string>,
): Set<string> {
  const names = new Set<string>();

  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt)) continue;

    const spec = stringValue(stmt.moduleSpecifier);
    if (!spec) continue;

    const resolved = resolveSpecifier(spec, absFile, repoRoot, srcDirRel);
    if (!resolved) continue;

    // 允许省略扩展名：@/service/$http -> src/service/$http.ts
    const matched = [...clientFiles].some(
      c => c === resolved || c.replace(/\.[jt]sx?$/, "") === resolved.replace(/\.[jt]sx?$/, ""),
    );
    if (!matched) continue;

    const clause = stmt.importClause;
    if (!clause) continue;
    if (clause.name) names.add(clause.name.text);
    const bindings = clause.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) {
      for (const el of bindings.elements) names.add(el.name.text);
    }
  }

  return names;
}

/** 收集「有导出的函数」及其函数体，用于定位 $http 调用 */
function exportedFunctions(sf: ts.SourceFile): { name: string; body: ts.Node }[] {
  const out: { name: string; body: ts.Node }[] = [];

  const isExported = (node: ts.Node): boolean => {
    const mods = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
    return mods?.some(m => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
  };

  for (const stmt of sf.statements) {
    if (ts.isFunctionDeclaration(stmt) && stmt.name && stmt.body) {
      if (isExported(stmt)) out.push({ name: stmt.name.text, body: stmt.body });
      continue;
    }
    if (ts.isVariableStatement(stmt) && isExported(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name) || !decl.initializer) continue;
        if (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer)) {
          out.push({ name: decl.name.text, body: decl.initializer.body });
        }
      }
    }
  }

  return out;
}

export function extractEndpoints(
  script: ScriptSource,
  absFile: string,
  repoRoot: string,
  srcDirRel: string | null,
  clientFiles: Set<string>,
): EndpointExtraction {
  const sf = createSource(script.code, absFile);
  const clients = clientBindings(sf, absFile, repoRoot, srcDirRel, clientFiles);
  const rel = toRepoRel(repoRoot, absFile);

  const endpoints: Endpoint[] = [];
  const nonEndpointFns: string[] = [];
  if (clients.size === 0) {
    // 这个文件根本不碰共享客户端，不当作"未解析"，避免噪音
    return { endpoints, nonEndpointFns };
  }

  for (const { name, body } of exportedFunctions(sf)) {
    const found: Endpoint[] = [];

    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
        const target = node.expression.expression;
        const method = node.expression.name.text;

        if (ts.isIdentifier(target) && clients.has(target.text)) {
          const url = stringValue(node.arguments[0]);
          if (url) {
            const line =
              sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1 + script.lineOffset;
            found.push({
              fn: name,
              method,
              url,
              urlPrefix: urlPrefixOf(url),
              file: rel,
              line,
            });
          }
        }
      }
      ts.forEachChild(node, visit);
    };

    visit(body);

    if (found.length === 0) nonEndpointFns.push(name);
    endpoints.push(...found);
  }

  return { endpoints, nonEndpointFns };
}
