import re

def main():
    file_path = "src/mcp/server.js"
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    # Import from repository
    content = content.replace('from "../services/crmService.js"', 'from "../services/crmRepository.js"')

    auth_code = """
const env = process.env.NODE_ENV || "development";
if ((env === "pilot" || env === "production") && process.env.AUTH_ENABLED !== "true") {
  console.error("FATAL: Khởi động thất bại. Hệ thống bắt buộc phải bật xác thực (AUTH_ENABLED=true) trên môi trường pilot/production.");
  process.exit(1);
}

function getIdentity() {
  return {
    userId: process.env.USER_ID || "mcp-user",
    rmId: process.env.RM_ID || "default",
    role: process.env.ROLE || "rm",
    branchId: process.env.BRANCH_ID || "default"
  };
}

function checkToolAuth(toolName) {
  if (process.env.AUTH_ENABLED !== "true") return null;
  const identity = getIdentity();
  if (toolName === "crm_list_campaigns" && identity.role !== "admin") {
    return "Lỗi: Tool này yêu cầu quyền admin.";
  }
  return null;
}
"""
    if "checkToolAuth" not in content:
        content = content.replace('const server = new McpServer', auth_code + '\nconst server = new McpServer')

    def replacer(match):
        tool_name = match.group(1)
        args = match.group(2)
        body = match.group(3)

        injection = f"""
    const authError = checkToolAuth("{tool_name}");
    if (authError) return ok({{ error: authError }});
    const identity = getIdentity();
"""
        body = body.replace('listCustomers()', 'listCustomers(identity)')
        body = body.replace('getCustomerByName(name)', 'getCustomerByName(name, identity)')
        body = body.replace('getMaturityCustomers(daysAhead)', 'getMaturityCustomers(daysAhead, identity)')
        body = body.replace('getCustomerOpportunities(customerId)', 'getCustomerOpportunities(customerId, identity)')
        body = body.replace('listOpportunities()', 'listOpportunities(identity)')
        body = body.replace('getCustomerInteractions(customerId)', 'getCustomerInteractions(customerId, identity)')
        body = body.replace('listInteractions()', 'listInteractions(identity)')
        body = body.replace('listCampaigns()', 'listCampaigns(identity)')
        body = body.replace('getCustomerById(customerId)', 'getCustomerById(customerId, identity)')

        return f'server.tool(\n  "{tool_name}",{args}{{\n{injection}{body}'

    content = re.sub(r'server\.tool\(\s*"([^"]+)",(.*?=>\s*)\{([^}]*)\}\s*\);', replacer, content, flags=re.DOTALL)

    with open(file_path, "w", encoding="utf-8") as f:
        f.write(content)

if __name__ == "__main__":
    main()
