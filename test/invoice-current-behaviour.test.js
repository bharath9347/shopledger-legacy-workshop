'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const config = require('../config');
const pricing = require('../lib/pricing');
const invoice = require('../lib/invoice');
const reports = require('../lib/reports');

function makeOrder() {
  return {
    id: 42,
    date: '2026-11-22',
    customer: 'Characterization Customer',
    paymentMode: 'cash',
    status: 'completed',
    coupon: 'SAVE10',
    subtotal: 3000,
    discount: 150,
    tax: 142.5,
    total: 2992.5,
    items: [{
      id: 7,
      sku: 'RICE-001',
      name: 'Rice',
      hsn: '1006',
      price: 3000,
      qty: 1
    }]
  };
}

test('CURRENT BEHAVIOUR: order pricing applies the HSN rate and coupon cap before GST', function () {
  const order = makeOrder();
  const totals = pricing.computeTotals(order.items, order.coupon);

  assert.equal(config.coupons.SAVE10.maxDiscount, 150);
  assert.deepEqual({
    subtotal: totals.subtotal,
    discount: totals.discount,
    taxable: totals.taxable,
    tax: totals.tax,
    cgst: totals.cgst,
    sgst: totals.sgst,
    total: totals.total,
    lineGstPercent: totals.lines[0].gstPercent
  }, {
    subtotal: 3000,
    discount: 150,
    taxable: 2850,
    tax: 142.5,
    cgst: 71.25,
    sgst: 71.25,
    total: 2992.5,
    lineGstPercent: 5
  });
});

test('invoice breakdown matches the billed order calculation', function () {
  const order = makeOrder();
  const billed = pricing.computeTotals(order.items, order.coupon);
  const figures = invoice.computeInvoiceFigures(order);

  assert.deepEqual({
    subtotal: figures.subtotal,
    discount: figures.discount,
    tax: figures.tax,
    cgst: figures.cgst,
    sgst: figures.sgst,
    total: figures.total,
    lineGstPercent: figures.rows[0].gstPercent
  }, {
    subtotal: billed.subtotal,
    discount: billed.discount,
    tax: billed.tax,
    cgst: billed.cgst,
    sgst: billed.sgst,
    total: billed.total,
    lineGstPercent: billed.lines[0].gstPercent
  });
});

test('invoice figures use the order HSN rate and capped subtotal discount', function () {
  const figures = invoice.computeInvoiceFigures(makeOrder());

  assert.deepEqual({
    subtotal: figures.subtotal,
    discount: figures.discount,
    tax: figures.tax,
    cgst: figures.cgst,
    sgst: figures.sgst,
    total: figures.total,
    lineGstPercent: figures.rows[0].gstPercent
  }, {
    subtotal: 3000,
    discount: 150,
    tax: 142.5,
    cgst: 71.25,
    sgst: 71.25,
    total: 2992.5,
    lineGstPercent: 5
  });
});

test('GST reconciliation matches invoice figures to the order ledger', function () {
  const result = reports.getGstReconciliation({ orders: [makeOrder()] });

  assert.equal(result.totalChecked, 1);
  assert.equal(result.mismatchCount, 0);
  assert.equal(result.totalDelta, 0);
  assert.deepEqual({
    invoiceDiscount: result.rows[0].invoiceDiscount,
    invoiceTax: result.rows[0].invoiceTax,
    invoiceTotal: result.rows[0].invoiceTotal,
    delta: result.rows[0].delta,
    matched: result.rows[0].matched
  }, {
    invoiceDiscount: 150,
    invoiceTax: 142.5,
    invoiceTotal: 2992.5,
    delta: 0,
    matched: true
  });
});

test('rendered invoice shows the billed total without a reconciliation notice', function () {
  const html = invoice.render(makeOrder());

  assert.match(html, /Invoice Total<\/td><td class="r">₹2992\.50/);
  assert.match(html, /<td class="r">5%<\/td>/);
  assert.match(html, /₹142\.50/);
  assert.doesNotMatch(html, /Accountant Reconciliation Notice/);
});
