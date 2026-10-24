/** Plaid sandbox stand-in. No network, no keys. */
export function createMockPlaid(
  transactions: { id: string; amountCents: number; payee: string; paid: boolean }[] = [],
) {
  return {
    async listTransactions() {
      return transactions;
    },
  };
}
