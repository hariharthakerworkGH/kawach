// "Mark bill paid" with the SMS a card's own bank sends when the bill is paid from its app (owner report, 28 Nov 2026): the message is the
// card's credit side ("payment received towards your card"), and the form refused it as "coming in". The class: a pasted message may be
// EITHER end of the one payment, so it is judged by amount and by what it says it is, never by which side of the money it is on.
import { test, equal } from './harness.js';
import { parseAlert, acceptsAsBillPayment } from '../js/alerts.js';

const HDFC_CARD = 'PAYMENT OF Rs. 15001.00 RECEIVED TOWARDS YOUR CREDIT CARD ENDING WITH 8513 ON 26-11-2026.YOUR AVAILABLE LIMIT IS RS. 760061.22';
const BANK_DEBIT = 'Rs.15001.00 debited from A/c XX1150 on 26-11-26 to HDFC CREDIT CARD. Avl bal Rs.18418.00';
const REFUND = 'Refund of Rs. 15001.00 credited to your credit card ending 8513 on 26-11-2026 for MERCHANT. Available limit is Rs. 760061.22';
const bill = 1500100;

test('bill paid by SMS: the card bank\'s "payment received" message stands for the bill', () => {
  const read = parseAlert(HDFC_CARD);
  equal(read.ok, true);
  equal(read.amount, bill);
  equal(acceptsAsBillPayment(read, bill), true);
});

test('bill paid by SMS: the paying bank\'s debit message still stands for the bill', () => {
  const read = parseAlert(BANK_DEBIT);
  equal(read.direction, 'debit');
  equal(acceptsAsBillPayment(read, bill), true);
});

test('bill paid by SMS: a refund or cashback of the same amount is not a payment', () => {
  const read = parseAlert(REFUND);
  equal(read.direction, 'credit');
  equal(acceptsAsBillPayment(read, bill), false);
});

test('bill paid by SMS: a different amount is refused, to the paisa, and an unreadable message too', () => {
  equal(acceptsAsBillPayment(parseAlert(HDFC_CARD), bill + 1), false);
  equal(acceptsAsBillPayment(parseAlert('hello there'), bill), false);
  equal(acceptsAsBillPayment(null, bill), false);
});
