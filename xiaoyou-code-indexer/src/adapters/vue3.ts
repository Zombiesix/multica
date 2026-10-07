import fs from "node:fs";
import * as ts from "typescript";
import {
  boolValue,
  createSource,
  dynamicImportSpecifier,
  getProp,
  resolveSpecifier,
  stringValue,
} from "../ast";
import type { RouteInfo } from "../types";

interface MetaFields {
  label: string | null;
  isSiderMenu: boolean | null;
  permissionCode: string | null;
  extraMeta: Record<string, string>;
}

function collectMeta(metaObj: ts.ObjectLiteralExpression | null): MetaFields {
  const out: MetaFields = {
    label: null,
    isSiderMenu: null,
    permissionCode: null,
    extraMeta: {},
  };
  if (!metaObj) return out;

  const codes: string[] = [];
  for (const p of metaObj.properties) {
    if (!ts.isPropertyAssignment(p)) continue;
    const key = ts.isIdentifier(p.name)
      ? p.name.text
      : ts.isStringLiteral(p.name)
        ? p.name.text
        : null;
    if (!key) continue;

    if (key === "label") {
      out.label = stringValue(p.initializer);
      continue;
    }
    if (key === "isSiderMenu") {
      out.isSiderMenu = boolValue(p.initializer);
      continue;
    }

    const literal = stringValue(p.initializer);
    if (literal !== null) {
      out.extraMeta[key] = literal;
      if (/permission/i.test(key) || /Code$/.test(key)) codes.push(literal);
    } else {
      out.extraMeta[key] = "<non-literal>";
    }
  }

  out.permissionCode = codes.length > 0 ? codes.join(",") : null;
  return out;
}

/**
 * 从集中式路由表里提取路由。
 * 覆盖形态：`export const routes: X[] = [{ path, name, component: () => import("@/..."), meta }]`
 */
export function extractRoutes(
  routerFileAbs: string,
  repoRoot: string,
  srcDirRel: string | null,
): { routes: RouteInfo[]; unresolved: string[] } {
  const code = fs.readFileSync(routerFileAbs, "utf8");
  const sf = createSource(code, routerFileAbs);
  const routes: RouteInfo[] = [];
  const unresolved: string[] = [];

  const routeFromObject = (obj: ts.ObjectLiteralExpression): RouteInfo => {
    const pathValue = stringValue(getProp(obj, "path")?.initializer);
    const nameValue = stringValue(getProp(obj, "name")?.initializer);
    const redirectValue = stringValue(getProp(obj, "redirect")?.initializer);

    const metaProp = getProp(obj, "meta");
    const metaObj =
      metaProp && ts.isObjectLiteralExpression(metaProp.initializer)
        ? metaProp.initializer
        : null;
    const meta = collectMeta(metaObj);

    let componentFile: string | null = null;
    const compProp = getProp(obj, "component");
    if (compProp) {
      const spec = dynamicImportSpecifier(compProp.initializer);
      if (spec) {
        componentFile = resolveSpecifier(spec, routerFileAbs, repoRoot, srcDirRel);
        if (!componentFile) unresolved.push(spec);
      } else {
        unresolved.push(`<非字面量 component @ ${pathValue ?? "?"}>`);
      }
    }

    return {
      path: pathValue ?? "",
      name: nameValue,
      label: meta.label,
      componentFile,
      redirect: redirectValue,
      isSiderMenu: meta.isSiderMenu,
      permissionCode: meta.permissionCode,
      extraMeta: meta.extraMeta,
    };
  };

  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === "routes"
    ) {
      const init = node.initializer;
      if (init && ts.isArrayLiteralExpression(init)) {
        for (const el of init.elements) {
          if (ts.isObjectLiteralExpression(el)) routes.push(routeFromObject(el));
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sf);
  return { routes, unresolved };
}
