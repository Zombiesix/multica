#!/usr/bin/env bash
set -e

NODE_CMD="node"
SERVER_PATH="D:/multica/swagger-mcp-server/node_modules/@aike1202/swagger-mcp-server/build/index.js"

claude mcp remove --scope user swagger-multi >/dev/null 2>&1 || true

claude mcp add --scope user swagger-multi -- "$NODE_CMD" "$SERVER_PATH" \
  "nursing-1-护理（住院）=http://192.168.1.211:9080/nursingswagger/v2/api-docs?group=1-%E6%8A%A4%E7%90%86%EF%BC%88%E4%BD%8F%E9%99%A2%EF%BC%89" \
  "nursing-2-护理（急诊）=http://192.168.1.211:9080/nursingswagger/v2/api-docs?group=2-%E6%8A%A4%E7%90%86%EF%BC%88%E6%80%A5%E8%AF%8A%EF%BC%89" \
  "nursing-3-护理计划（住院）=http://192.168.1.211:9080/nursingswagger/v2/api-docs?group=3-%E6%8A%A4%E7%90%86%E8%AE%A1%E5%88%92%EF%BC%88%E4%BD%8F%E9%99%A2%EF%BC%89" \
  "nursing-4-护理计划（急诊）=http://192.168.1.211:9080/nursingswagger/v2/api-docs?group=4-%E6%8A%A4%E7%90%86%E8%AE%A1%E5%88%92%EF%BC%88%E6%80%A5%E8%AF%8A%EF%BC%89" \
  "nursing-5-护理管理（住院）=http://192.168.1.211:9080/nursingswagger/v2/api-docs?group=5-%E6%8A%A4%E7%90%86%E7%AE%A1%E7%90%86%EF%BC%88%E4%BD%8F%E9%99%A2%EF%BC%89" \
  "nursing-6-护理管理（急诊）=http://192.168.1.211:9080/nursingswagger/v2/api-docs?group=6-%E6%8A%A4%E7%90%86%E7%AE%A1%E7%90%86%EF%BC%88%E6%80%A5%E8%AF%8A%EF%BC%89" \
  "nursing-7-移动医护=http://192.168.1.211:9080/nursingswagger/v2/api-docs?group=7-%E7%A7%BB%E5%8A%A8%E5%8C%BB%E6%8A%A4" \
  "nursing-8-护理大屏=http://192.168.1.211:9080/nursingswagger/v2/api-docs?group=8-%E6%8A%A4%E7%90%86%E5%A4%A7%E5%B1%8F" \
  "nursing-报告卡=http://192.168.1.211:9080/nursingswagger/v2/api-docs?group=%E6%8A%A5%E5%91%8A%E5%8D%A1" \
  "nursing-未分类=http://192.168.1.211:9080/nursingswagger/v2/api-docs?group=%E6%9C%AA%E5%88%86%E7%B1%BB" \
  "icis-default=http://192.168.1.211:9080/icisswagger/v2/api-docs?group=defaultGroup" \
  "treat-default=http://192.168.1.211:9080/treatswagger/v2/api-docs?group=defaultGroup" \
  "cssd-default=http://192.168.1.211:9080/cssdSwagger/v2/api-docs?group=defaultGroup"
