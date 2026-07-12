import sys

def main():
    file_path = "src/mcp/server.js"
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    # Import from repository
    content = content.replace('from "../services/crmService.js"', 'from "../services/crmRepository.js"')

    # Add identity fetching and auth check
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

    # Now replace the inner bodies of server.tool
    # Just look for async (args) => { or async () => {
    # and insert checkToolAuth and getIdentity

    parts = content.split("server.tool(")
    for i in range(1, len(parts)):
        part = parts[i]
        # find the tool name
        tool_name = part.split('"')[1]

        # find the function start
        if "async () => {" in part:
            parts[i] = part.replace("async () => {", f"""async () => {{
    const authError = checkToolAuth("{tool_name}");
    if (authError) return ok({{ error: authError }});
    const identity = getIdentity();""")
        elif "async ({" in part:
            # find async ({ ... }) => {
            idx = part.find(") => {")
            if idx != -1:
                parts[i] = part[:idx + 7] + f"""
    const authError = checkToolAuth("{tool_name}");
    if (authError) return ok({{ error: authError }});
    const identity = getIdentity();""" + part[idx+7:]

    content = "server.tool(".join(parts)

    # replace listCustomers() with listCustomers(identity)
    content = content.replace('listCustomers()', 'listCustomers(identity)')
    content = content.replace('getCustomerByName(name)', 'getCustomerByName(name, identity)')
    content = content.replace('getMaturityCustomers(daysAhead)', 'getMaturityCustomers(daysAhead, identity)')
    content = content.replace('getCustomerOpportunities(customerId)', 'getCustomerOpportunities(customerId, identity)')
    content = content.replace('listOpportunities()', 'listOpportunities(identity)')
    content = content.replace('getCustomerInteractions(customerId)', 'getCustomerInteractions(customerId, identity)')
    content = content.replace('listInteractions()', 'listInteractions(identity)')
    content = content.replace('listCampaigns()', 'listCampaigns(identity)')
    content = content.replace('getCustomerById(customerId)', 'getCustomerById(customerId, identity)')

    with open(file_path, "w", encoding="utf-8") as f:
        f.write(content)

if __name__ == "__main__":
    main()
