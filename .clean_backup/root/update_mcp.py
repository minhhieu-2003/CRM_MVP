import re
import sys

def main():
    file_path = "src/services/mcpContextEngine.js"
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    # Change import
    content = content.replace('from "./crmService.js"', 'from "./crmRepository.js"')

    # Change functions to accept identity
    # detectCustomerName
    content = content.replace('async function detectCustomerName(message) {', 'async function detectCustomerName(message, identity) {')
    content = content.replace('const customers = await listCustomers();', 'const customers = await listCustomers(identity);')
    content = content.replace('const askedName = await detectCustomerName(message);', 'const askedName = await detectCustomerName(message, identity);')

    # resolveTargetCustomers
    content = content.replace('async function resolveTargetCustomers({ askedName, state, fallbackDue }) {', 'async function resolveTargetCustomers({ askedName, state, fallbackDue, identity }) {')
    content = content.replace('await getCustomerByName(askedName)', 'await getCustomerByName(askedName, identity)')
    content = content.replace('getCustomerById(id)', 'getCustomerById(id, identity)')
    content = content.replace('getMaturityCustomers(7)', 'getMaturityCustomers(7, identity)')

    # processConversation
    content = content.replace('async function processConversation({ conversationId, message }) {', 'async function processConversation({ conversationId, message, identity }) {')
    content = content.replace('const dueCustomers = await getMaturityCustomers(7);', 'const dueCustomers = await getMaturityCustomers(7, identity);')

    # fix call to processConversation in routeConversation
    content = content.replace('const result = await processConversation(payload);', 'const result = await processConversation(payload);')

    # other calls
    content = content.replace('await resolveTargetCustomers({ askedName, state, fallbackDue: true })', 'await resolveTargetCustomers({ askedName, state, fallbackDue: true, identity })')
    content = content.replace('await resolveTargetCustomers({ askedName, state, fallbackDue: false })', 'await resolveTargetCustomers({ askedName, state, fallbackDue: false, identity })')

    content = content.replace('getCustomerOpportunities(customer.id)', 'getCustomerOpportunities(customer.id, identity)')
    content = content.replace('getCustomerInteractions(customer.id)', 'getCustomerInteractions(customer.id, identity)')
    content = content.replace('draftEmailForCustomer(customer,', 'draftEmailForCustomer(customer,') # doesn't need identity
    content = content.replace('draftCallScript(customer,', 'draftCallScript(customer,')

    with open(file_path, "w", encoding="utf-8") as f:
        f.write(content)

if __name__ == "__main__":
    main()
