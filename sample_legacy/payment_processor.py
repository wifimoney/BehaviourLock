"""
sample_legacy/payment_processor.py
A deliberately Python-2-style module with:
- print statements
- unicode literals
- dict.iteritems()
- old exception syntax
- xrange usage
- dead code
"""

import os
import logging

logger = logging.getLogger(__name__)


class PaymentProcessor(object):

    def __init__(self, merchant_id):
        self.merchant_id = merchant_id
        self.api_key = os.environ.get("PAYMENT_API_KEY", "")
        self._rates = {u"USD": 1.0, u"EUR": 0.92, u"GBP": 0.79}

    def process_payment(self, amount, currency=u"USD"):
        """Process a payment and return a transaction dict."""
        if currency not in self._rates:
            raise ValueError(u"Unsupported currency: %s" % currency)

        converted = self._convert(amount, currency)
        fee = self._calculate_fee(converted)

        print "Processing payment: %.2f %s (converted: %.2f USD, fee: %.2f)" % (
            amount, currency, converted, fee
        )

        result = {
            u"merchant_id":   self.merchant_id,
            u"amount":        amount,
            u"currency":      currency,
            u"converted_usd": converted,
            u"fee":           fee,
            u"net":           converted - fee,
            u"status":        u"pending",
        }
        return result

    def _convert(self, amount, currency):
        rate = self._rates.get(currency, 1.0)
        return round(amount / rate, 2)

    def _calculate_fee(self, amount_usd):
        """Fee schedule: 2.9% + $0.30 flat."""
        return round(amount_usd * 0.029 + 0.30, 2)

    def get_supported_currencies(self):
        currencies = []
        for code, rate in self._rates.iteritems():
            currencies.append({u"code": code, u"rate": rate})
        return currencies

    def validate_card(self, card_number):
        digits = [int(d) for d in str(card_number) if d.isdigit()]
        total = 0
        for i in xrange(len(digits) - 2, -1, -2):
            val = digits[i] * 2
            total += val - 9 if val > 9 else val
        total += sum(digits[-1::-2][:-1])
        return total % 10 == 0

    def batch_process(self, payments):
        results = []
        for i in xrange(len(payments)):
            try:
                r = self.process_payment(
                    payments[i][u"amount"],
                    payments[i].get(u"currency", u"USD"),
                )
                results.append(r)
            except Exception, e:
                logger.error(u"Payment %d failed: %s" % (i, unicode(e)))
                results.append({u"status": u"failed", u"error": unicode(e)})
        return results

    # DEAD CODE — left from v1
    # def old_fee_calculator(self, amount):
    #     return amount * 0.035
    # def legacy_convert(self, amount, from_currency, to_currency):
    #     old_rates = {"USD": 1.0, "EUR": 0.90}
    #     return amount * (old_rates[to_currency] / old_rates[from_currency])


def main():
    processor = PaymentProcessor(merchant_id=u"MERCH_001")
    print "Supported currencies:"
    for c in processor.get_supported_currencies():
        print "  %s: %.4f" % (c[u"code"], c[u"rate"])

    result = processor.process_payment(100.0, u"EUR")
    print "Result: %s" % result


if __name__ == u"__main__":
    main()
