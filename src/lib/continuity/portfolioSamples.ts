export const bridgeSample = {
  route: {
    id: "Bridge-01",
    destinationNetwork: "xrpl-evm-mainnet",
    destinationAccount: "Sample treasury wallet",
    destinationAssetId: "sample-token-contract",
    expectedDelivered: "995",
  },
  source: {
    network: "xrpl-mainnet",
    transactionId: "Sample source hash",
    status: "confirmed",
  },
  bridge: { messageId: "sample-message", status: "confirmed" },
  receipt: {
    messageId: "sample-message",
    network: "xrpl-evm-mainnet",
    account: "Sample treasury wallet",
    assetId: "sample-token-contract",
    delivered: "995",
    transactionId: "Sample destination hash",
    status: "confirmed",
  },
  creditExportComplete: true,
  credits: [
    {
      receiptTransactionId: "Sample destination hash",
      assetId: "sample-token-contract",
      amount: "1000",
    },
  ],
};
export const lendingSample = {
  assetId: "Sample issuer:USD",
  portfolioValue: "1000000",
  borrowerId: "Borrower A",
  maximumShareBps: 2500,
  requested: "100000",
  exportComplete: true,
  loans: [
    {
      loanId: "Loan-01",
      entityId: "Borrower A",
      address: "Sample wallet A",
      assetId: "Sample issuer:USD",
      outstanding: "120000",
    },
    {
      loanId: "Loan-02",
      entityId: "Borrower A",
      address: "Sample wallet B",
      assetId: "Sample issuer:USD",
      outstanding: "80000",
    },
  ],
};
