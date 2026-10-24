import { readFileSync } from 'node:fs';
export const studyCurriculum = [
  ...JSON.parse(readFileSync(new URL('./study-foundations.json', import.meta.url), 'utf8')),
  JSON.parse(readFileSync(new URL('./study-banking.json', import.meta.url), 'utf8'))
];
// Retained only to recognize untouched starter drafts during the non-destructive upgrade.
const question = (prompt, options, correctIndex) => ({ prompt, options, correctIndex });
export const legacyStudyCurriculum = [
  {
    title: 'Getting Started with Duranki',
    content: 'Duranki connects your account to the communities and services available to you. One person can hold several roles. Check the selected community before viewing services or submitting information.\n\nKeep your password and authenticator codes private. An administrator will never need your current authenticator code in a message. Sign out on shared devices and report unfamiliar activity.\n\nOpen a lesson, study its material and save your place when you leave. Submit every quiz answer and review the lesson if you need another attempt. Study completion is a learning record; it does not by itself create a grant payment.\n\nActivity: identify your community and the services you use, then write down where you would report an account problem.',
    questions: [question('What should you check before using a community service?', ['The selected community', 'Another trader\'s password', 'The colour of your phone'], 0), question('What does completing a study module record?', ['An automatic grant payment', 'Your learning completion', 'A new bank account'], 1)]
  },
  {
    title: 'Financial Literacy and Business Records',
    content: 'Keep business income and expenses separate from personal spending. Record each sale and purchase with a date, amount, description and supporting receipt. Track money owed by customers and amounts owed to suppliers.\n\nCash flow describes money moving into and out of the business. Profit and available cash are different: a profitable sale on credit may not put cash in your wallet today. Compare your records with cash, bank and wallet activity regularly.\n\nA simple daily record includes opening cash, cash sales, customer repayments, purchases, other expenses and closing cash. Investigate differences rather than changing figures to make them match. Keep records securely and seek qualified advice for tax requirements.\n\nActivity: create a sample daily record and identify one unpaid customer invoice.',
    questions: [question('Which record best supports an expense?', ['A receipt with date and amount', 'A guess at the end of the month', 'Only a verbal reminder'], 0), question('A sale on credit means:', ['Cash is always received immediately', 'Profit and available cash may differ', 'No record is needed'], 1)]
  },
  {
    title: 'Pricing, Costs and Profit',
    content: 'Calculate the full cost of selling an item: purchase price, transport, packaging, transaction charges and a fair share of operating expenses. Revenue is money earned from sales; profit is what remains after relevant costs.\n\nIf an item sells for R30 and its total cost is R24, the profit is R6. Markup compares profit with cost (R6 / R24 = 25%). Margin compares profit with selling price (R6 / R30 = 20%). Do not confuse the two.\n\nCompare your price with customer value and competing offers, but do not ignore your costs. Before offering a discount, recalculate the remaining profit. Track damaged stock and losses too.\n\nActivity: calculate cost, price, profit and margin for one product. These are learning examples, not recommended prices.',
    questions: [question('Selling price is R30 and total cost is R24. What is the profit?', ['R54', 'R24', 'R6'], 2), question('Profit margin compares profit with:', ['Selling price', 'Only transport cost', 'The number of customers'], 0)]
  },
  {
    title: 'Stock Control and Bulk Buying',
    content: 'Maintain a stock list showing opening quantity, purchases, sales, losses and closing quantity. Count physical stock regularly and compare it with records. Rotate date-sensitive stock so older suitable items sell first.\n\nBulk buying can reduce unit prices, but it also ties up cash and requires storage. Compare total delivered cost, demand, shelf life, order minimums and payment terms before joining an order. A discount is not useful if unsold stock expires.\n\nFor a shared order, agree quantities, responsibilities, collection details and how shortages or refunds will be handled. Keep the supplier confirmation and check delivered quantities against the order. Platform discounts depend on the supplier and your applicable subscription terms.\n\nActivity: compare two delivered-price offers and estimate how long it will take to sell the stock.',
    questions: [question('What should you compare before a bulk purchase?', ['Only the advertised discount', 'Delivered cost, demand and storage needs', 'Only the supplier logo'], 1), question('Why count physical stock?', ['To reconcile actual stock with records', 'To avoid recording sales', 'To make expired stock usable'], 0)]
  },
  {
    title: 'Customer Service and Marketing',
    content: 'Good service starts with clear prices, reliable product information and respectful communication. Listen to complaints, confirm what happened and explain the next step. Promise only what you can deliver.\n\nChoose marketing channels your customers actually use. A useful offer states the product, price, availability and how to order. Get permission before adding people to marketing lists, protect customer details and make it easy to stop receiving messages.\n\nMeasure results: record the cost of a promotion, enquiries and resulting sales. More messages or views do not automatically mean more profit. Ask returning customers what they value.\n\nActivity: write a short, accurate product offer and a polite response to a delayed-delivery complaint.',
    questions: [question('A good response to a complaint starts with:', ['Ignoring the customer', 'Listening and confirming the problem', 'Promising anything immediately'], 1), question('Before adding a customer to a marketing list, you should:', ['Obtain permission', 'Publish their contact details', 'Share their password'], 0)]
  },
  {
    title: 'Business Growth and Sustainability',
    content: 'Grow from evidence, not only enthusiasm. Review sales, profit, customer demand and cash flow before adding products or locations. Set a specific goal, a budget, a responsible person and a review date.\n\nConsider risks such as supplier delays, equipment failure, seasonal demand and spoilage. Keep records backed up and plan how essential work continues if you are unavailable. Reduce waste and use energy and materials carefully where practical.\n\nFunding is not free operating income: understand eligibility, conditions, repayment obligations where applicable and reporting requirements. Completing study modules does not guarantee funding; grant configuration and approval remain separate.\n\nActivity: prepare a 30-day improvement plan with one measurable goal, estimated cost, main risk and a date to review results.',
    questions: [question('A useful growth plan includes:', ['Only an ambitious promise', 'A goal, budget and review date', 'No record of costs'], 1), question('Does study completion guarantee grant payment?', ['Yes, automatically', 'Only if you repeat the quiz', 'No; funding has separate rules and approval'], 2)]
  }
];
