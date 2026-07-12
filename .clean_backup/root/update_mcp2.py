import re
import sys

def main():
    file_path = "src/services/mcpContextEngine.js"
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    # We need to make sure processConversation gets identity
    content = content.replace('const opportunities = await listOpportunities();', 'const opportunities = await listOpportunities(identity);')
    content = content.replace('const campaigns = await listCampaigns();', 'const campaigns = await listCampaigns(identity);')

    # We already replaced resolveTargetCustomers, but let's check

    with open(file_path, "w", encoding="utf-8") as f:
        f.write(content)

if __name__ == "__main__":
    main()
