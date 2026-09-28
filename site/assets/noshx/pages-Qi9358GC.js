var Nr = Object.defineProperty;
var Pr = (e, i, n) => i in e ? Nr(e, i, { enumerable: !0, configurable: !0, writable: !0, value: n }) : e[i] = n;
var j = (e, i, n) => Pr(e, typeof i != "symbol" ? i + "" : i, n);
function Cr(e, i) {
  for (var n = 0; n < i.length; n++) {
    const r = i[n];
    if (typeof r != "string" && !Array.isArray(r)) {
      for (const t in r)
        if (t !== "default" && !(t in e)) {
          const o = Object.getOwnPropertyDescriptor(r, t);
          o && Object.defineProperty(e, t, o.get ? o : {
            enumerable: !0,
            get: () => r[t]
          });
        }
    }
  }
  return Object.freeze(Object.defineProperty(e, Symbol.toStringTag, { value: "Module" }));
}
function Br(e) {
  return e && e.__esModule && Object.prototype.hasOwnProperty.call(e, "default") ? e.default : e;
}
function dn(e) {
  if (Object.prototype.hasOwnProperty.call(e, "__esModule")) return e;
  var i = e.default;
  if (typeof i == "function") {
    var n = function r() {
      var t = !1;
      try {
        t = this instanceof r;
      } catch {
      }
      return t ? Reflect.construct(i, arguments, this.constructor) : i.apply(this, arguments);
    };
    n.prototype = i.prototype;
  } else n = {};
  return Object.defineProperty(n, "__esModule", { value: !0 }), Object.keys(e).forEach(function(r) {
    var t = Object.getOwnPropertyDescriptor(e, r);
    Object.defineProperty(n, r, t.get ? t : {
      enumerable: !0,
      get: function() {
        return e[r];
      }
    });
  }), n;
}
var Zt = {}, Te = {}, et = {};
const xr = { asfAccountTxnID: 5, asfAllowTrustLineClawback: 16, asfAllowTrustLineLocking: 17, asfAuthorizedNFTokenMinter: 10, asfDefaultRipple: 8, asfDepositAuth: 9, asfDisableMaster: 4, asfDisallowIncomingCheck: 13, asfDisallowIncomingNFTokenOffer: 12, asfDisallowIncomingPayChan: 14, asfDisallowIncomingTrustline: 15, asfDisallowXRP: 3, asfGlobalFreeze: 7, asfNoFreeze: 6, asfRequireAuth: 2, asfRequireDest: 1 }, Ur = /* @__PURE__ */ JSON.parse('[["Invalid",{"isSerialized":false,"isSigningField":false,"isVLEncoded":false,"nth":-1,"type":"Unknown"}],["ObjectEndMarker",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":1,"type":"STObject"}],["ArrayEndMarker",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":1,"type":"STArray"}],["taker_gets_funded",{"isSerialized":false,"isSigningField":false,"isVLEncoded":false,"nth":258,"type":"Amount"}],["taker_pays_funded",{"isSerialized":false,"isSigningField":false,"isVLEncoded":false,"nth":259,"type":"Amount"}],["Generic",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":0,"type":"Unknown"}],["LedgerEntryType",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":1,"type":"UInt16"}],["TransactionType",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":2,"type":"UInt16"}],["SignerWeight",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":3,"type":"UInt16"}],["TransferFee",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":4,"type":"UInt16"}],["TradingFee",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":5,"type":"UInt16"}],["DiscountedFee",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":6,"type":"UInt16"}],["Version",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":16,"type":"UInt16"}],["LedgerFixType",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":21,"type":"UInt16"}],["ManagementFeeRate",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":22,"type":"UInt16"}],["NetworkID",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":1,"type":"UInt32"}],["Flags",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":2,"type":"UInt32"}],["SourceTag",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":3,"type":"UInt32"}],["Sequence",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":4,"type":"UInt32"}],["PreviousTxnLgrSeq",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":5,"type":"UInt32"}],["LedgerSequence",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":6,"type":"UInt32"}],["CloseTime",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":7,"type":"UInt32"}],["ParentCloseTime",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":8,"type":"UInt32"}],["SigningTime",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":9,"type":"UInt32"}],["Expiration",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":10,"type":"UInt32"}],["TransferRate",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":11,"type":"UInt32"}],["WalletSize",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":12,"type":"UInt32"}],["OwnerCount",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":13,"type":"UInt32"}],["DestinationTag",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":14,"type":"UInt32"}],["LastUpdateTime",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":15,"type":"UInt32"}],["HighQualityIn",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":16,"type":"UInt32"}],["HighQualityOut",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":17,"type":"UInt32"}],["LowQualityIn",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":18,"type":"UInt32"}],["LowQualityOut",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":19,"type":"UInt32"}],["QualityIn",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":20,"type":"UInt32"}],["QualityOut",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":21,"type":"UInt32"}],["StampEscrow",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":22,"type":"UInt32"}],["BondAmount",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":23,"type":"UInt32"}],["LoadFee",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":24,"type":"UInt32"}],["OfferSequence",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":25,"type":"UInt32"}],["FirstLedgerSequence",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":26,"type":"UInt32"}],["LastLedgerSequence",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":27,"type":"UInt32"}],["TransactionIndex",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":28,"type":"UInt32"}],["OperationLimit",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":29,"type":"UInt32"}],["ReferenceFeeUnits",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":30,"type":"UInt32"}],["ReserveBase",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":31,"type":"UInt32"}],["ReserveIncrement",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":32,"type":"UInt32"}],["SetFlag",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":33,"type":"UInt32"}],["ClearFlag",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":34,"type":"UInt32"}],["SignerQuorum",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":35,"type":"UInt32"}],["CancelAfter",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":36,"type":"UInt32"}],["FinishAfter",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":37,"type":"UInt32"}],["SignerListID",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":38,"type":"UInt32"}],["SettleDelay",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":39,"type":"UInt32"}],["TicketCount",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":40,"type":"UInt32"}],["TicketSequence",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":41,"type":"UInt32"}],["NFTokenTaxon",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":42,"type":"UInt32"}],["MintedNFTokens",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":43,"type":"UInt32"}],["BurnedNFTokens",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":44,"type":"UInt32"}],["VoteWeight",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":48,"type":"UInt32"}],["FirstNFTokenSequence",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":50,"type":"UInt32"}],["OracleDocumentID",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":51,"type":"UInt32"}],["PermissionValue",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":52,"type":"UInt32"}],["ImmutableFlags",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":53,"type":"UInt32"}],["StartDate",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":54,"type":"UInt32"}],["PaymentInterval",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":55,"type":"UInt32"}],["GracePeriod",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":56,"type":"UInt32"}],["PreviousPaymentDueDate",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":57,"type":"UInt32"}],["NextPaymentDueDate",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":58,"type":"UInt32"}],["PaymentRemaining",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":59,"type":"UInt32"}],["PaymentTotal",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":60,"type":"UInt32"}],["LoanSequence",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":61,"type":"UInt32"}],["CoverRateMinimum",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":62,"type":"UInt32"}],["CoverRateLiquidation",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":63,"type":"UInt32"}],["OverpaymentFee",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":64,"type":"UInt32"}],["InterestRate",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":65,"type":"UInt32"}],["LateInterestRate",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":66,"type":"UInt32"}],["CloseInterestRate",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":67,"type":"UInt32"}],["OverpaymentInterestRate",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":68,"type":"UInt32"}],["ConfidentialBalanceVersion",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":69,"type":"UInt32"}],["SponsoredOwnerCount",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":70,"type":"UInt32"}],["SponsoringOwnerCount",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":71,"type":"UInt32"}],["SponsoringAccountCount",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":72,"type":"UInt32"}],["RemainingOwnerCount",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":73,"type":"UInt32"}],["SponsorFlags",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":74,"type":"UInt32"}],["SubscriptionDate",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":75,"type":"UInt32"}],["RedemptionDate",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":76,"type":"UInt32"}],["IssuerKeyEpoch",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":77,"type":"UInt32"}],["AuditorKeyEpoch",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":78,"type":"UInt32"}],["IssuerKeyMirrorEpoch",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":79,"type":"UInt32"}],["AuditorKeyMirrorEpoch",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":80,"type":"UInt32"}],["IndexNext",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":1,"type":"UInt64"}],["IndexPrevious",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":2,"type":"UInt64"}],["BookNode",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":3,"type":"UInt64"}],["OwnerNode",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":4,"type":"UInt64"}],["BaseFee",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":5,"type":"UInt64"}],["ExchangeRate",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":6,"type":"UInt64"}],["LowNode",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":7,"type":"UInt64"}],["HighNode",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":8,"type":"UInt64"}],["DestinationNode",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":9,"type":"UInt64"}],["Cookie",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":10,"type":"UInt64"}],["ServerVersion",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":11,"type":"UInt64"}],["NFTokenOfferNode",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":12,"type":"UInt64"}],["EmitBurden",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":13,"type":"UInt64"}],["ReferenceCount",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":19,"type":"UInt64"}],["XChainClaimID",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":20,"type":"UInt64"}],["XChainAccountCreateCount",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":21,"type":"UInt64"}],["XChainAccountClaimCount",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":22,"type":"UInt64"}],["AssetPrice",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":23,"type":"UInt64"}],["MaximumAmount",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":24,"type":"UInt64"}],["OutstandingAmount",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":25,"type":"UInt64"}],["MPTAmount",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":26,"type":"UInt64"}],["IssuerNode",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":27,"type":"UInt64"}],["SubjectNode",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":28,"type":"UInt64"}],["LockedAmount",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":29,"type":"UInt64"}],["VaultNode",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":30,"type":"UInt64"}],["LoanBrokerNode",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":31,"type":"UInt64"}],["ConfidentialOutstandingAmount",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":32,"type":"UInt64"}],["SponseeNode",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":33,"type":"UInt64"}],["EmailHash",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":1,"type":"Hash128"}],["LedgerHash",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":1,"type":"Hash256"}],["ParentHash",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":2,"type":"Hash256"}],["TransactionHash",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":3,"type":"Hash256"}],["AccountHash",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":4,"type":"Hash256"}],["PreviousTxnID",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":5,"type":"Hash256"}],["LedgerIndex",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":6,"type":"Hash256"}],["WalletLocator",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":7,"type":"Hash256"}],["RootIndex",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":8,"type":"Hash256"}],["AccountTxnID",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":9,"type":"Hash256"}],["NFTokenID",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":10,"type":"Hash256"}],["EmitParentTxnID",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":11,"type":"Hash256"}],["EmitNonce",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":12,"type":"Hash256"}],["EmitHookHash",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":13,"type":"Hash256"}],["AMMID",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":14,"type":"Hash256"}],["BookDirectory",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":16,"type":"Hash256"}],["InvoiceID",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":17,"type":"Hash256"}],["Nickname",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":18,"type":"Hash256"}],["Amendment",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":19,"type":"Hash256"}],["Digest",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":21,"type":"Hash256"}],["Channel",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":22,"type":"Hash256"}],["ConsensusHash",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":23,"type":"Hash256"}],["CheckID",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":24,"type":"Hash256"}],["ValidatedHash",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":25,"type":"Hash256"}],["PreviousPageMin",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":26,"type":"Hash256"}],["NextPageMin",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":27,"type":"Hash256"}],["NFTokenBuyOffer",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":28,"type":"Hash256"}],["NFTokenSellOffer",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":29,"type":"Hash256"}],["DomainID",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":34,"type":"Hash256"}],["VaultID",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":35,"type":"Hash256"}],["ParentBatchID",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":36,"type":"Hash256"}],["LoanBrokerID",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":37,"type":"Hash256"}],["LoanID",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":38,"type":"Hash256"}],["ReferenceHolding",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":39,"type":"Hash256"}],["BlindingFactor",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":40,"type":"Hash256"}],["ObjectID",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":41,"type":"Hash256"}],["hash",{"isSerialized":false,"isSigningField":false,"isVLEncoded":false,"nth":257,"type":"Hash256"}],["index",{"isSerialized":false,"isSigningField":false,"isVLEncoded":false,"nth":258,"type":"Hash256"}],["Amount",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":1,"type":"Amount"}],["Balance",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":2,"type":"Amount"}],["LimitAmount",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":3,"type":"Amount"}],["TakerPays",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":4,"type":"Amount"}],["TakerGets",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":5,"type":"Amount"}],["LowLimit",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":6,"type":"Amount"}],["HighLimit",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":7,"type":"Amount"}],["Fee",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":8,"type":"Amount"}],["SendMax",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":9,"type":"Amount"}],["DeliverMin",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":10,"type":"Amount"}],["Amount2",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":11,"type":"Amount"}],["BidMin",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":12,"type":"Amount"}],["BidMax",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":13,"type":"Amount"}],["MinimumOffer",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":16,"type":"Amount"}],["RippleEscrow",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":17,"type":"Amount"}],["DeliveredAmount",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":18,"type":"Amount"}],["NFTokenBrokerFee",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":19,"type":"Amount"}],["BaseFeeDrops",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":22,"type":"Amount"}],["ReserveBaseDrops",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":23,"type":"Amount"}],["ReserveIncrementDrops",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":24,"type":"Amount"}],["LPTokenOut",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":25,"type":"Amount"}],["LPTokenIn",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":26,"type":"Amount"}],["EPrice",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":27,"type":"Amount"}],["Price",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":28,"type":"Amount"}],["SignatureReward",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":29,"type":"Amount"}],["MinAccountCreateAmount",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":30,"type":"Amount"}],["LPTokenBalance",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":31,"type":"Amount"}],["FeeAmount",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":32,"type":"Amount"}],["MaxFee",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":33,"type":"Amount"}],["FeeAmountDelta",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":34,"type":"Amount"}],["PublicKey",{"isSerialized":true,"isSigningField":true,"isVLEncoded":true,"nth":1,"type":"Blob"}],["MessageKey",{"isSerialized":true,"isSigningField":true,"isVLEncoded":true,"nth":2,"type":"Blob"}],["SigningPubKey",{"isSerialized":true,"isSigningField":true,"isVLEncoded":true,"nth":3,"type":"Blob"}],["TxnSignature",{"isSerialized":true,"isSigningField":false,"isVLEncoded":true,"nth":4,"type":"Blob"}],["URI",{"isSerialized":true,"isSigningField":true,"isVLEncoded":true,"nth":5,"type":"Blob"}],["Signature",{"isSerialized":true,"isSigningField":false,"isVLEncoded":true,"nth":6,"type":"Blob"}],["Domain",{"isSerialized":true,"isSigningField":true,"isVLEncoded":true,"nth":7,"type":"Blob"}],["FundCode",{"isSerialized":true,"isSigningField":true,"isVLEncoded":true,"nth":8,"type":"Blob"}],["RemoveCode",{"isSerialized":true,"isSigningField":true,"isVLEncoded":true,"nth":9,"type":"Blob"}],["ExpireCode",{"isSerialized":true,"isSigningField":true,"isVLEncoded":true,"nth":10,"type":"Blob"}],["CreateCode",{"isSerialized":true,"isSigningField":true,"isVLEncoded":true,"nth":11,"type":"Blob"}],["MemoType",{"isSerialized":true,"isSigningField":true,"isVLEncoded":true,"nth":12,"type":"Blob"}],["MemoData",{"isSerialized":true,"isSigningField":true,"isVLEncoded":true,"nth":13,"type":"Blob"}],["MemoFormat",{"isSerialized":true,"isSigningField":true,"isVLEncoded":true,"nth":14,"type":"Blob"}],["Fulfillment",{"isSerialized":true,"isSigningField":true,"isVLEncoded":true,"nth":16,"type":"Blob"}],["Condition",{"isSerialized":true,"isSigningField":true,"isVLEncoded":true,"nth":17,"type":"Blob"}],["MasterSignature",{"isSerialized":true,"isSigningField":false,"isVLEncoded":true,"nth":18,"type":"Blob"}],["UNLModifyValidator",{"isSerialized":true,"isSigningField":true,"isVLEncoded":true,"nth":19,"type":"Blob"}],["ValidatorToDisable",{"isSerialized":true,"isSigningField":true,"isVLEncoded":true,"nth":20,"type":"Blob"}],["ValidatorToReEnable",{"isSerialized":true,"isSigningField":true,"isVLEncoded":true,"nth":21,"type":"Blob"}],["DIDDocument",{"isSerialized":true,"isSigningField":true,"isVLEncoded":true,"nth":26,"type":"Blob"}],["Data",{"isSerialized":true,"isSigningField":true,"isVLEncoded":true,"nth":27,"type":"Blob"}],["AssetClass",{"isSerialized":true,"isSigningField":true,"isVLEncoded":true,"nth":28,"type":"Blob"}],["Provider",{"isSerialized":true,"isSigningField":true,"isVLEncoded":true,"nth":29,"type":"Blob"}],["MPTokenMetadata",{"isSerialized":true,"isSigningField":true,"isVLEncoded":true,"nth":30,"type":"Blob"}],["CredentialType",{"isSerialized":true,"isSigningField":true,"isVLEncoded":true,"nth":31,"type":"Blob"}],["ConfidentialBalanceInbox",{"isSerialized":true,"isSigningField":true,"isVLEncoded":true,"nth":32,"type":"Blob"}],["ConfidentialBalanceSpending",{"isSerialized":true,"isSigningField":true,"isVLEncoded":true,"nth":33,"type":"Blob"}],["IssuerEncryptedBalance",{"isSerialized":true,"isSigningField":true,"isVLEncoded":true,"nth":34,"type":"Blob"}],["IssuerEncryptionKey",{"isSerialized":true,"isSigningField":true,"isVLEncoded":true,"nth":35,"type":"Blob"}],["HolderEncryptionKey",{"isSerialized":true,"isSigningField":true,"isVLEncoded":true,"nth":36,"type":"Blob"}],["ZKProof",{"isSerialized":true,"isSigningField":true,"isVLEncoded":true,"nth":37,"type":"Blob"}],["HolderEncryptedAmount",{"isSerialized":true,"isSigningField":true,"isVLEncoded":true,"nth":38,"type":"Blob"}],["IssuerEncryptedAmount",{"isSerialized":true,"isSigningField":true,"isVLEncoded":true,"nth":39,"type":"Blob"}],["SenderEncryptedAmount",{"isSerialized":true,"isSigningField":true,"isVLEncoded":true,"nth":40,"type":"Blob"}],["DestinationEncryptedAmount",{"isSerialized":true,"isSigningField":true,"isVLEncoded":true,"nth":41,"type":"Blob"}],["AuditorEncryptedBalance",{"isSerialized":true,"isSigningField":true,"isVLEncoded":true,"nth":42,"type":"Blob"}],["AuditorEncryptedAmount",{"isSerialized":true,"isSigningField":true,"isVLEncoded":true,"nth":43,"type":"Blob"}],["AuditorEncryptionKey",{"isSerialized":true,"isSigningField":true,"isVLEncoded":true,"nth":44,"type":"Blob"}],["AmountCommitment",{"isSerialized":true,"isSigningField":true,"isVLEncoded":true,"nth":45,"type":"Blob"}],["BalanceCommitment",{"isSerialized":true,"isSigningField":true,"isVLEncoded":true,"nth":46,"type":"Blob"}],["Account",{"isSerialized":true,"isSigningField":true,"isVLEncoded":true,"nth":1,"type":"AccountID"}],["Owner",{"isSerialized":true,"isSigningField":true,"isVLEncoded":true,"nth":2,"type":"AccountID"}],["Destination",{"isSerialized":true,"isSigningField":true,"isVLEncoded":true,"nth":3,"type":"AccountID"}],["Issuer",{"isSerialized":true,"isSigningField":true,"isVLEncoded":true,"nth":4,"type":"AccountID"}],["Authorize",{"isSerialized":true,"isSigningField":true,"isVLEncoded":true,"nth":5,"type":"AccountID"}],["Unauthorize",{"isSerialized":true,"isSigningField":true,"isVLEncoded":true,"nth":6,"type":"AccountID"}],["RegularKey",{"isSerialized":true,"isSigningField":true,"isVLEncoded":true,"nth":8,"type":"AccountID"}],["NFTokenMinter",{"isSerialized":true,"isSigningField":true,"isVLEncoded":true,"nth":9,"type":"AccountID"}],["EmitCallback",{"isSerialized":true,"isSigningField":true,"isVLEncoded":true,"nth":10,"type":"AccountID"}],["Holder",{"isSerialized":true,"isSigningField":true,"isVLEncoded":true,"nth":11,"type":"AccountID"}],["Delegate",{"isSerialized":true,"isSigningField":true,"isVLEncoded":true,"nth":12,"type":"AccountID"}],["OtherChainSource",{"isSerialized":true,"isSigningField":true,"isVLEncoded":true,"nth":18,"type":"AccountID"}],["OtherChainDestination",{"isSerialized":true,"isSigningField":true,"isVLEncoded":true,"nth":19,"type":"AccountID"}],["AttestationSignerAccount",{"isSerialized":true,"isSigningField":true,"isVLEncoded":true,"nth":20,"type":"AccountID"}],["AttestationRewardAccount",{"isSerialized":true,"isSigningField":true,"isVLEncoded":true,"nth":21,"type":"AccountID"}],["LockingChainDoor",{"isSerialized":true,"isSigningField":true,"isVLEncoded":true,"nth":22,"type":"AccountID"}],["IssuingChainDoor",{"isSerialized":true,"isSigningField":true,"isVLEncoded":true,"nth":23,"type":"AccountID"}],["Subject",{"isSerialized":true,"isSigningField":true,"isVLEncoded":true,"nth":24,"type":"AccountID"}],["Borrower",{"isSerialized":true,"isSigningField":true,"isVLEncoded":true,"nth":25,"type":"AccountID"}],["Counterparty",{"isSerialized":true,"isSigningField":true,"isVLEncoded":true,"nth":26,"type":"AccountID"}],["Sponsor",{"isSerialized":true,"isSigningField":true,"isVLEncoded":true,"nth":27,"type":"AccountID"}],["HighSponsor",{"isSerialized":true,"isSigningField":true,"isVLEncoded":true,"nth":28,"type":"AccountID"}],["LowSponsor",{"isSerialized":true,"isSigningField":true,"isVLEncoded":true,"nth":29,"type":"AccountID"}],["CounterpartySponsor",{"isSerialized":true,"isSigningField":true,"isVLEncoded":true,"nth":30,"type":"AccountID"}],["Sponsee",{"isSerialized":true,"isSigningField":true,"isVLEncoded":true,"nth":31,"type":"AccountID"}],["Number",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":1,"type":"Number"}],["AssetsAvailable",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":2,"type":"Number"}],["AssetsMaximum",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":3,"type":"Number"}],["AssetsTotal",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":4,"type":"Number"}],["LossUnrealized",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":5,"type":"Number"}],["DebtTotal",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":6,"type":"Number"}],["DebtMaximum",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":7,"type":"Number"}],["CoverAvailable",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":8,"type":"Number"}],["LoanOriginationFee",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":9,"type":"Number"}],["LoanServiceFee",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":10,"type":"Number"}],["LatePaymentFee",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":11,"type":"Number"}],["ClosePaymentFee",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":12,"type":"Number"}],["PrincipalOutstanding",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":13,"type":"Number"}],["PrincipalRequested",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":14,"type":"Number"}],["TotalValueOutstanding",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":15,"type":"Number"}],["PeriodicPayment",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":16,"type":"Number"}],["ManagementFeeOutstanding",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":17,"type":"Number"}],["LoanScale",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":1,"type":"Int32"}],["RemainingOwnerCountDelta",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":2,"type":"Int32"}],["TransactionMetaData",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":2,"type":"STObject"}],["CreatedNode",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":3,"type":"STObject"}],["DeletedNode",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":4,"type":"STObject"}],["ModifiedNode",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":5,"type":"STObject"}],["PreviousFields",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":6,"type":"STObject"}],["FinalFields",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":7,"type":"STObject"}],["NewFields",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":8,"type":"STObject"}],["TemplateEntry",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":9,"type":"STObject"}],["Memo",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":10,"type":"STObject"}],["SignerEntry",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":11,"type":"STObject"}],["NFToken",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":12,"type":"STObject"}],["EmitDetails",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":13,"type":"STObject"}],["Permission",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":15,"type":"STObject"}],["Signer",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":16,"type":"STObject"}],["Majority",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":18,"type":"STObject"}],["DisabledValidator",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":19,"type":"STObject"}],["VoteEntry",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":25,"type":"STObject"}],["AuctionSlot",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":26,"type":"STObject"}],["AuthAccount",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":27,"type":"STObject"}],["XChainClaimProofSig",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":28,"type":"STObject"}],["XChainCreateAccountProofSig",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":29,"type":"STObject"}],["XChainClaimAttestationCollectionElement",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":30,"type":"STObject"}],["XChainCreateAccountAttestationCollectionElement",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":31,"type":"STObject"}],["PriceData",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":32,"type":"STObject"}],["Credential",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":33,"type":"STObject"}],["RawTransaction",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":34,"type":"STObject"}],["BatchSigner",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":35,"type":"STObject"}],["Book",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":36,"type":"STObject"}],["CounterpartySignature",{"isSerialized":true,"isSigningField":false,"isVLEncoded":false,"nth":37,"type":"STObject"}],["SponsorSignature",{"isSerialized":true,"isSigningField":false,"isVLEncoded":false,"nth":38,"type":"STObject"}],["Signers",{"isSerialized":true,"isSigningField":false,"isVLEncoded":false,"nth":3,"type":"STArray"}],["SignerEntries",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":4,"type":"STArray"}],["Template",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":5,"type":"STArray"}],["Necessary",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":6,"type":"STArray"}],["Sufficient",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":7,"type":"STArray"}],["AffectedNodes",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":8,"type":"STArray"}],["Memos",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":9,"type":"STArray"}],["NFTokens",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":10,"type":"STArray"}],["VoteSlots",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":12,"type":"STArray"}],["AdditionalBooks",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":13,"type":"STArray"}],["Majorities",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":16,"type":"STArray"}],["DisabledValidators",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":17,"type":"STArray"}],["XChainClaimAttestations",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":21,"type":"STArray"}],["XChainCreateAccountAttestations",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":22,"type":"STArray"}],["PriceDataSeries",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":24,"type":"STArray"}],["AuthAccounts",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":25,"type":"STArray"}],["AuthorizeCredentials",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":26,"type":"STArray"}],["UnauthorizeCredentials",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":27,"type":"STArray"}],["AcceptedCredentials",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":28,"type":"STArray"}],["Permissions",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":29,"type":"STArray"}],["RawTransactions",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":30,"type":"STArray"}],["BatchSigners",{"isSerialized":true,"isSigningField":false,"isVLEncoded":false,"nth":31,"type":"STArray"}],["CloseResolution",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":1,"type":"UInt8"}],["Method",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":2,"type":"UInt8"}],["TransactionResult",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":3,"type":"UInt8"}],["Scale",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":4,"type":"UInt8"}],["AssetScale",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":5,"type":"UInt8"}],["LEVersion",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":6,"type":"UInt8"}],["TickSize",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":16,"type":"UInt8"}],["UNLModifyDisabling",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":17,"type":"UInt8"}],["WasLockingChainSend",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":19,"type":"UInt8"}],["WithdrawalPolicy",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":20,"type":"UInt8"}],["ContractResult",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":21,"type":"UInt8"}],["VaultKind",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":22,"type":"UInt8"}],["TakerPaysCurrency",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":1,"type":"Hash160"}],["TakerPaysIssuer",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":2,"type":"Hash160"}],["TakerGetsCurrency",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":3,"type":"Hash160"}],["TakerGetsIssuer",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":4,"type":"Hash160"}],["Paths",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":1,"type":"PathSet"}],["Indexes",{"isSerialized":true,"isSigningField":true,"isVLEncoded":true,"nth":1,"type":"Vector256"}],["Hashes",{"isSerialized":true,"isSigningField":true,"isVLEncoded":true,"nth":2,"type":"Vector256"}],["Amendments",{"isSerialized":true,"isSigningField":true,"isVLEncoded":true,"nth":3,"type":"Vector256"}],["NFTokenOffers",{"isSerialized":true,"isSigningField":true,"isVLEncoded":true,"nth":4,"type":"Vector256"}],["CredentialIDs",{"isSerialized":true,"isSigningField":true,"isVLEncoded":true,"nth":5,"type":"Vector256"}],["MPTokenIssuanceID",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":1,"type":"Hash192"}],["ShareMPTID",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":2,"type":"Hash192"}],["TakerPaysMPT",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":3,"type":"Hash192"}],["TakerGetsMPT",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":4,"type":"Hash192"}],["LockingChainIssue",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":1,"type":"Issue"}],["IssuingChainIssue",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":2,"type":"Issue"}],["Asset",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":3,"type":"Issue"}],["Asset2",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":4,"type":"Issue"}],["XChainBridge",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":1,"type":"XChainBridge"}],["BaseAsset",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":1,"type":"Currency"}],["QuoteAsset",{"isSerialized":true,"isSigningField":true,"isVLEncoded":false,"nth":2,"type":"Currency"}],["Transaction",{"isSerialized":false,"isSigningField":false,"isVLEncoded":false,"nth":257,"type":"Transaction"}],["LedgerEntry",{"isSerialized":false,"isSigningField":false,"isVLEncoded":false,"nth":257,"type":"LedgerEntry"}],["Validation",{"isSerialized":false,"isSigningField":false,"isVLEncoded":false,"nth":257,"type":"Validation"}],["Metadata",{"isSerialized":false,"isSigningField":false,"isVLEncoded":false,"nth":257,"type":"Metadata"}]]'), Rr = { AccountRoot: { lsfAllowTrustLineClawback: 2147483648, lsfAllowTrustLineLocking: 1073741824, lsfDefaultRipple: 8388608, lsfDepositAuth: 16777216, lsfDisableMaster: 1048576, lsfDisallowIncomingCheck: 134217728, lsfDisallowIncomingNFTokenOffer: 67108864, lsfDisallowIncomingPayChan: 268435456, lsfDisallowIncomingTrustline: 536870912, lsfDisallowXRP: 524288, lsfGlobalFreeze: 4194304, lsfNoFreeze: 2097152, lsfPasswordSpent: 65536, lsfRequireAuth: 262144, lsfRequireDestTag: 131072 }, Credential: { lsfAccepted: 65536 }, DirNode: { lsfNFTokenBuyOffers: 1, lsfNFTokenSellOffers: 2 }, Loan: { lsfLoanDefault: 65536, lsfLoanImpaired: 131072, lsfLoanOverpayment: 262144 }, MPToken: { lsfMPTAMM: 4, lsfMPTAuthorized: 2, lsfMPTLocked: 1 }, MPTokenIssuance: { lsfMPTCanClawback: 64, lsfMPTCanEscrow: 8, lsfMPTCanHoldConfidentialBalance: 128, lsfMPTCanLock: 2, lsfMPTCanTrade: 16, lsfMPTCanTransfer: 32, lsfMPTLocked: 1, lsfMPTRequireAuth: 4 }, NFTokenOffer: { lsfSellNFToken: 1 }, Offer: { lsfHybrid: 262144, lsfPassive: 65536, lsfSell: 131072 }, RippleState: { lsfAMMNode: 16777216, lsfHighAuth: 524288, lsfHighDeepFreeze: 67108864, lsfHighFreeze: 8388608, lsfHighNoRipple: 2097152, lsfHighReserve: 131072, lsfLowAuth: 262144, lsfLowDeepFreeze: 33554432, lsfLowFreeze: 4194304, lsfLowNoRipple: 1048576, lsfLowReserve: 65536 }, SignerList: { lsfOneOwnerCount: 65536 }, Sponsorship: { lsfSponsorshipRequireSignForFee: 65536, lsfSponsorshipRequireSignForReserve: 131072 }, Vault: { lsfVaultPrivate: 65536 } }, Mr = /* @__PURE__ */ JSON.parse('{"AMM":[{"name":"Account","optionality":0},{"name":"TradingFee","optionality":2},{"name":"VoteSlots","optionality":1},{"name":"AuctionSlot","optionality":1},{"name":"LPTokenBalance","optionality":0},{"name":"Asset","optionality":0},{"name":"Asset2","optionality":0},{"name":"OwnerNode","optionality":0},{"name":"PreviousTxnID","optionality":1},{"name":"PreviousTxnLgrSeq","optionality":1}],"AccountRoot":[{"name":"Account","optionality":0},{"name":"Sequence","optionality":0},{"name":"Balance","optionality":0},{"name":"OwnerCount","optionality":0},{"name":"PreviousTxnID","optionality":0},{"name":"PreviousTxnLgrSeq","optionality":0},{"name":"AccountTxnID","optionality":1},{"name":"RegularKey","optionality":1},{"name":"EmailHash","optionality":1},{"name":"WalletLocator","optionality":1},{"name":"WalletSize","optionality":1},{"name":"MessageKey","optionality":1},{"name":"TransferRate","optionality":1},{"name":"Domain","optionality":1},{"name":"TickSize","optionality":1},{"name":"TicketCount","optionality":1},{"name":"NFTokenMinter","optionality":1},{"name":"MintedNFTokens","optionality":2},{"name":"BurnedNFTokens","optionality":2},{"name":"FirstNFTokenSequence","optionality":1},{"name":"SponsoredOwnerCount","optionality":2},{"name":"SponsoringOwnerCount","optionality":2},{"name":"SponsoringAccountCount","optionality":2},{"name":"AMMID","optionality":1},{"name":"VaultID","optionality":1},{"name":"LoanBrokerID","optionality":1}],"Amendments":[{"name":"Amendments","optionality":1},{"name":"Majorities","optionality":1},{"name":"PreviousTxnID","optionality":1},{"name":"PreviousTxnLgrSeq","optionality":1}],"Bridge":[{"name":"Account","optionality":0},{"name":"SignatureReward","optionality":0},{"name":"MinAccountCreateAmount","optionality":1},{"name":"XChainBridge","optionality":0},{"name":"XChainClaimID","optionality":0},{"name":"XChainAccountCreateCount","optionality":0},{"name":"XChainAccountClaimCount","optionality":0},{"name":"OwnerNode","optionality":0},{"name":"PreviousTxnID","optionality":0},{"name":"PreviousTxnLgrSeq","optionality":0}],"Check":[{"name":"Account","optionality":0},{"name":"Destination","optionality":0},{"name":"SendMax","optionality":0},{"name":"Sequence","optionality":0},{"name":"OwnerNode","optionality":0},{"name":"DestinationNode","optionality":0},{"name":"Expiration","optionality":1},{"name":"InvoiceID","optionality":1},{"name":"SourceTag","optionality":1},{"name":"DestinationTag","optionality":1},{"name":"PreviousTxnID","optionality":0},{"name":"PreviousTxnLgrSeq","optionality":0}],"Credential":[{"name":"Subject","optionality":0},{"name":"Issuer","optionality":0},{"name":"CredentialType","optionality":0},{"name":"Expiration","optionality":1},{"name":"URI","optionality":1},{"name":"IssuerNode","optionality":0},{"name":"SubjectNode","optionality":1},{"name":"PreviousTxnID","optionality":0},{"name":"PreviousTxnLgrSeq","optionality":0}],"DID":[{"name":"Account","optionality":0},{"name":"DIDDocument","optionality":1},{"name":"URI","optionality":1},{"name":"Data","optionality":1},{"name":"OwnerNode","optionality":0},{"name":"PreviousTxnID","optionality":0},{"name":"PreviousTxnLgrSeq","optionality":0}],"Delegate":[{"name":"Account","optionality":0},{"name":"Authorize","optionality":0},{"name":"Permissions","optionality":0},{"name":"OwnerNode","optionality":0},{"name":"DestinationNode","optionality":1},{"name":"PreviousTxnID","optionality":0},{"name":"PreviousTxnLgrSeq","optionality":0}],"DepositPreauth":[{"name":"Account","optionality":0},{"name":"Authorize","optionality":1},{"name":"OwnerNode","optionality":0},{"name":"PreviousTxnID","optionality":0},{"name":"PreviousTxnLgrSeq","optionality":0},{"name":"AuthorizeCredentials","optionality":1}],"DirectoryNode":[{"name":"Owner","optionality":1},{"name":"TakerPaysCurrency","optionality":1},{"name":"TakerPaysIssuer","optionality":1},{"name":"TakerPaysMPT","optionality":1},{"name":"TakerGetsCurrency","optionality":1},{"name":"TakerGetsIssuer","optionality":1},{"name":"TakerGetsMPT","optionality":1},{"name":"ExchangeRate","optionality":1},{"name":"Indexes","optionality":0},{"name":"RootIndex","optionality":0},{"name":"IndexNext","optionality":1},{"name":"IndexPrevious","optionality":1},{"name":"NFTokenID","optionality":1},{"name":"PreviousTxnID","optionality":1},{"name":"PreviousTxnLgrSeq","optionality":1},{"name":"DomainID","optionality":1}],"Escrow":[{"name":"Account","optionality":0},{"name":"Sequence","optionality":1},{"name":"Destination","optionality":0},{"name":"Amount","optionality":0},{"name":"Condition","optionality":1},{"name":"CancelAfter","optionality":1},{"name":"FinishAfter","optionality":1},{"name":"SourceTag","optionality":1},{"name":"DestinationTag","optionality":1},{"name":"OwnerNode","optionality":0},{"name":"PreviousTxnID","optionality":0},{"name":"PreviousTxnLgrSeq","optionality":0},{"name":"DestinationNode","optionality":1},{"name":"TransferRate","optionality":1},{"name":"IssuerNode","optionality":1}],"FeeSettings":[{"name":"BaseFee","optionality":1},{"name":"ReferenceFeeUnits","optionality":1},{"name":"ReserveBase","optionality":1},{"name":"ReserveIncrement","optionality":1},{"name":"BaseFeeDrops","optionality":1},{"name":"ReserveBaseDrops","optionality":1},{"name":"ReserveIncrementDrops","optionality":1},{"name":"PreviousTxnID","optionality":1},{"name":"PreviousTxnLgrSeq","optionality":1}],"LedgerHashes":[{"name":"FirstLedgerSequence","optionality":1},{"name":"LastLedgerSequence","optionality":1},{"name":"Hashes","optionality":0}],"Loan":[{"name":"PreviousTxnID","optionality":0},{"name":"PreviousTxnLgrSeq","optionality":0},{"name":"OwnerNode","optionality":0},{"name":"LoanBrokerNode","optionality":0},{"name":"LoanBrokerID","optionality":0},{"name":"LoanSequence","optionality":0},{"name":"Borrower","optionality":0},{"name":"LoanOriginationFee","optionality":2},{"name":"LoanServiceFee","optionality":2},{"name":"LatePaymentFee","optionality":2},{"name":"ClosePaymentFee","optionality":2},{"name":"OverpaymentFee","optionality":2},{"name":"InterestRate","optionality":2},{"name":"LateInterestRate","optionality":2},{"name":"CloseInterestRate","optionality":2},{"name":"OverpaymentInterestRate","optionality":2},{"name":"StartDate","optionality":0},{"name":"PaymentInterval","optionality":0},{"name":"GracePeriod","optionality":2},{"name":"PreviousPaymentDueDate","optionality":2},{"name":"NextPaymentDueDate","optionality":2},{"name":"PaymentRemaining","optionality":2},{"name":"PeriodicPayment","optionality":0},{"name":"PrincipalOutstanding","optionality":2},{"name":"TotalValueOutstanding","optionality":2},{"name":"ManagementFeeOutstanding","optionality":2},{"name":"LoanScale","optionality":2}],"LoanBroker":[{"name":"PreviousTxnID","optionality":0},{"name":"PreviousTxnLgrSeq","optionality":0},{"name":"Sequence","optionality":0},{"name":"OwnerNode","optionality":0},{"name":"VaultNode","optionality":0},{"name":"VaultID","optionality":0},{"name":"Account","optionality":0},{"name":"Owner","optionality":0},{"name":"LoanSequence","optionality":0},{"name":"Data","optionality":2},{"name":"ManagementFeeRate","optionality":2},{"name":"OwnerCount","optionality":2},{"name":"DebtTotal","optionality":2},{"name":"DebtMaximum","optionality":2},{"name":"CoverAvailable","optionality":2},{"name":"CoverRateMinimum","optionality":2},{"name":"CoverRateLiquidation","optionality":2}],"MPToken":[{"name":"Account","optionality":0},{"name":"MPTokenIssuanceID","optionality":0},{"name":"MPTAmount","optionality":2},{"name":"LockedAmount","optionality":1},{"name":"OwnerNode","optionality":0},{"name":"PreviousTxnID","optionality":0},{"name":"PreviousTxnLgrSeq","optionality":0},{"name":"ConfidentialBalanceInbox","optionality":1},{"name":"ConfidentialBalanceSpending","optionality":1},{"name":"ConfidentialBalanceVersion","optionality":2},{"name":"IssuerEncryptedBalance","optionality":1},{"name":"AuditorEncryptedBalance","optionality":1},{"name":"HolderEncryptionKey","optionality":1}],"MPTokenIssuance":[{"name":"Issuer","optionality":0},{"name":"Sequence","optionality":0},{"name":"TransferFee","optionality":2},{"name":"OwnerNode","optionality":0},{"name":"AssetScale","optionality":2},{"name":"MaximumAmount","optionality":1},{"name":"OutstandingAmount","optionality":0},{"name":"LockedAmount","optionality":1},{"name":"MPTokenMetadata","optionality":1},{"name":"PreviousTxnID","optionality":0},{"name":"PreviousTxnLgrSeq","optionality":0},{"name":"DomainID","optionality":1},{"name":"ImmutableFlags","optionality":2},{"name":"ReferenceHolding","optionality":1},{"name":"IssuerEncryptionKey","optionality":1},{"name":"AuditorEncryptionKey","optionality":1},{"name":"IssuerKeyEpoch","optionality":1},{"name":"AuditorKeyEpoch","optionality":1},{"name":"ConfidentialOutstandingAmount","optionality":2}],"NFTokenOffer":[{"name":"Owner","optionality":0},{"name":"NFTokenID","optionality":0},{"name":"Amount","optionality":0},{"name":"OwnerNode","optionality":0},{"name":"NFTokenOfferNode","optionality":0},{"name":"Destination","optionality":1},{"name":"Expiration","optionality":1},{"name":"PreviousTxnID","optionality":0},{"name":"PreviousTxnLgrSeq","optionality":0}],"NFTokenPage":[{"name":"PreviousPageMin","optionality":1},{"name":"NextPageMin","optionality":1},{"name":"NFTokens","optionality":0},{"name":"PreviousTxnID","optionality":0},{"name":"PreviousTxnLgrSeq","optionality":0}],"NegativeUNL":[{"name":"DisabledValidators","optionality":1},{"name":"ValidatorToDisable","optionality":1},{"name":"ValidatorToReEnable","optionality":1},{"name":"PreviousTxnID","optionality":1},{"name":"PreviousTxnLgrSeq","optionality":1}],"Offer":[{"name":"Account","optionality":0},{"name":"Sequence","optionality":0},{"name":"TakerPays","optionality":0},{"name":"TakerGets","optionality":0},{"name":"BookDirectory","optionality":0},{"name":"BookNode","optionality":0},{"name":"OwnerNode","optionality":0},{"name":"PreviousTxnID","optionality":0},{"name":"PreviousTxnLgrSeq","optionality":0},{"name":"Expiration","optionality":1},{"name":"DomainID","optionality":1},{"name":"AdditionalBooks","optionality":1}],"Oracle":[{"name":"Owner","optionality":0},{"name":"OracleDocumentID","optionality":1},{"name":"Provider","optionality":0},{"name":"PriceDataSeries","optionality":0},{"name":"AssetClass","optionality":0},{"name":"LastUpdateTime","optionality":0},{"name":"URI","optionality":1},{"name":"OwnerNode","optionality":0},{"name":"PreviousTxnID","optionality":0},{"name":"PreviousTxnLgrSeq","optionality":0}],"PayChannel":[{"name":"Account","optionality":0},{"name":"Destination","optionality":0},{"name":"Sequence","optionality":1},{"name":"Amount","optionality":0},{"name":"Balance","optionality":0},{"name":"PublicKey","optionality":0},{"name":"SettleDelay","optionality":0},{"name":"Expiration","optionality":1},{"name":"CancelAfter","optionality":1},{"name":"SourceTag","optionality":1},{"name":"DestinationTag","optionality":1},{"name":"OwnerNode","optionality":0},{"name":"PreviousTxnID","optionality":0},{"name":"PreviousTxnLgrSeq","optionality":0},{"name":"DestinationNode","optionality":1}],"PermissionedDomain":[{"name":"Owner","optionality":0},{"name":"Sequence","optionality":0},{"name":"AcceptedCredentials","optionality":0},{"name":"OwnerNode","optionality":0},{"name":"PreviousTxnID","optionality":0},{"name":"PreviousTxnLgrSeq","optionality":0}],"RippleState":[{"name":"Balance","optionality":0},{"name":"LowLimit","optionality":0},{"name":"HighLimit","optionality":0},{"name":"PreviousTxnID","optionality":0},{"name":"PreviousTxnLgrSeq","optionality":0},{"name":"LowNode","optionality":1},{"name":"LowQualityIn","optionality":1},{"name":"LowQualityOut","optionality":1},{"name":"HighNode","optionality":1},{"name":"HighQualityIn","optionality":1},{"name":"HighQualityOut","optionality":1},{"name":"HighSponsor","optionality":1},{"name":"LowSponsor","optionality":1}],"SignerList":[{"name":"Owner","optionality":1},{"name":"OwnerNode","optionality":0},{"name":"SignerQuorum","optionality":0},{"name":"SignerEntries","optionality":0},{"name":"SignerListID","optionality":0},{"name":"PreviousTxnID","optionality":0},{"name":"PreviousTxnLgrSeq","optionality":0}],"Sponsorship":[{"name":"PreviousTxnID","optionality":0},{"name":"PreviousTxnLgrSeq","optionality":0},{"name":"Owner","optionality":0},{"name":"Sponsee","optionality":0},{"name":"FeeAmount","optionality":1},{"name":"MaxFee","optionality":1},{"name":"RemainingOwnerCount","optionality":2},{"name":"OwnerNode","optionality":0},{"name":"SponseeNode","optionality":0}],"Ticket":[{"name":"Account","optionality":0},{"name":"OwnerNode","optionality":0},{"name":"TicketSequence","optionality":0},{"name":"PreviousTxnID","optionality":0},{"name":"PreviousTxnLgrSeq","optionality":0}],"Vault":[{"name":"PreviousTxnID","optionality":0},{"name":"PreviousTxnLgrSeq","optionality":0},{"name":"Sequence","optionality":0},{"name":"OwnerNode","optionality":0},{"name":"Owner","optionality":0},{"name":"Account","optionality":0},{"name":"Data","optionality":1},{"name":"Asset","optionality":0},{"name":"AssetsTotal","optionality":2},{"name":"AssetsAvailable","optionality":2},{"name":"AssetsMaximum","optionality":2},{"name":"LossUnrealized","optionality":2},{"name":"ShareMPTID","optionality":0},{"name":"WithdrawalPolicy","optionality":0},{"name":"Scale","optionality":2},{"name":"LEVersion","optionality":2},{"name":"VaultKind","optionality":2},{"name":"SubscriptionDate","optionality":1},{"name":"RedemptionDate","optionality":1}],"XChainOwnedClaimID":[{"name":"Account","optionality":0},{"name":"XChainBridge","optionality":0},{"name":"XChainClaimID","optionality":0},{"name":"OtherChainSource","optionality":0},{"name":"XChainClaimAttestations","optionality":0},{"name":"SignatureReward","optionality":0},{"name":"OwnerNode","optionality":0},{"name":"PreviousTxnID","optionality":0},{"name":"PreviousTxnLgrSeq","optionality":0}],"XChainOwnedCreateAccountClaimID":[{"name":"Account","optionality":0},{"name":"XChainBridge","optionality":0},{"name":"XChainAccountCreateCount","optionality":0},{"name":"XChainCreateAccountAttestations","optionality":0},{"name":"OwnerNode","optionality":0},{"name":"PreviousTxnID","optionality":0},{"name":"PreviousTxnLgrSeq","optionality":0}],"common":[{"name":"LedgerIndex","optionality":1},{"name":"LedgerEntryType","optionality":0},{"name":"Flags","optionality":0},{"name":"Sponsor","optionality":1}]}'), Vr = { AMM: 121, AccountRoot: 97, Amendments: 102, Bridge: 105, Check: 67, Credential: 129, DID: 73, Delegate: 131, DepositPreauth: 112, DirectoryNode: 100, Escrow: 117, FeeSettings: 115, Invalid: -1, LedgerHashes: 104, Loan: 137, LoanBroker: 136, MPToken: 127, MPTokenIssuance: 126, NFTokenOffer: 55, NFTokenPage: 80, NegativeUNL: 78, Offer: 111, Oracle: 128, PayChannel: 120, PermissionedDomain: 130, RippleState: 114, SignerList: 83, Sponsorship: 144, Ticket: 84, Vault: 132, XChainOwnedClaimID: 113, XChainOwnedCreateAccountClaimID: 116 }, zr = { AMMClawback: { tfClawTwoAssets: 1 }, AMMDeposit: { tfLPToken: 65536, tfLimitLPToken: 4194304, tfOneAssetLPToken: 2097152, tfSingleAsset: 524288, tfTwoAsset: 1048576, tfTwoAssetIfEmpty: 8388608 }, AMMWithdraw: { tfLPToken: 65536, tfLimitLPToken: 4194304, tfOneAssetLPToken: 2097152, tfOneAssetWithdrawAll: 262144, tfSingleAsset: 524288, tfTwoAsset: 1048576, tfWithdrawAll: 131072 }, AccountSet: { tfAllowXRP: 2097152, tfDisallowXRP: 1048576, tfOptionalAuth: 524288, tfOptionalDestTag: 131072, tfRequireAuth: 262144, tfRequireDestTag: 65536 }, Batch: { tfAllOrNothing: 65536, tfIndependent: 524288, tfOnlyOne: 131072, tfUntilFailure: 262144 }, EnableAmendment: { tfGotMajority: 65536, tfLostMajority: 131072 }, LoanManage: { tfLoanDefault: 65536, tfLoanImpair: 131072, tfLoanUnimpair: 262144 }, LoanPay: { tfLoanFullPayment: 131072, tfLoanLatePayment: 262144, tfLoanOverpayment: 65536 }, LoanSet: { tfLoanOverpayment: 65536 }, MPTokenAuthorize: { tfMPTUnauthorize: 1 }, MPTokenIssuanceCreate: { tfMPTCanClawback: 64, tfMPTCanEscrow: 8, tfMPTCanHoldConfidentialBalance: 128, tfMPTCanLock: 2, tfMPTCanTrade: 16, tfMPTCanTransfer: 32, tfMPTRequireAuth: 4 }, MPTokenIssuanceSet: { tfMPTLock: 1, tfMPTSetCanClawback: 128, tfMPTSetCanEscrow: 16, tfMPTSetCanHoldConfidentialBalance: 256, tfMPTSetCanLock: 4, tfMPTSetCanTrade: 32, tfMPTSetCanTransfer: 64, tfMPTSetRequireAuth: 8, tfMPTUnlock: 2 }, NFTokenCreateOffer: { tfSellNFToken: 1 }, NFTokenMint: { tfBurnable: 1, tfMutable: 16, tfOnlyXRP: 2, tfTransferable: 8 }, OfferCreate: { tfFillOrKill: 262144, tfHybrid: 1048576, tfImmediateOrCancel: 131072, tfPassive: 65536, tfSell: 524288 }, Payment: { tfLimitQuality: 262144, tfNoRippleDirect: 65536, tfPartialPayment: 131072, tfSponsorCreatedAccount: 524288 }, PaymentChannelClaim: { tfClose: 131072, tfRenew: 65536 }, SponsorshipSet: { tfDeleteObject: 1048576, tfSponsorshipClearRequireSignForFee: 131072, tfSponsorshipClearRequireSignForReserve: 524288, tfSponsorshipSetRequireSignForFee: 65536, tfSponsorshipSetRequireSignForReserve: 262144 }, SponsorshipTransfer: { tfSponsorshipCreate: 131072, tfSponsorshipEnd: 65536, tfSponsorshipReassign: 262144 }, TrustSet: { tfClearDeepFreeze: 8388608, tfClearFreeze: 2097152, tfClearNoRipple: 262144, tfSetDeepFreeze: 4194304, tfSetFreeze: 1048576, tfSetNoRipple: 131072, tfSetfAuth: 65536 }, VaultCreate: { tfVaultPrivate: 65536, tfVaultShareNonTransferable: 131072 }, XChainModifyBridge: { tfClearAccountCreateAmount: 65536 }, universal: { tfFullyCanonicalSig: 2147483648, tfInnerBatchTxn: 1073741824 } }, vr = /* @__PURE__ */ JSON.parse('{"AMMBid":[{"name":"Asset","optionality":0},{"name":"Asset2","optionality":0},{"name":"BidMin","optionality":1},{"name":"BidMax","optionality":1},{"name":"AuthAccounts","optionality":1}],"AMMClawback":[{"name":"Holder","optionality":0},{"name":"Asset","optionality":0},{"name":"Asset2","optionality":0},{"name":"Amount","optionality":1}],"AMMCreate":[{"name":"Amount","optionality":0},{"name":"Amount2","optionality":0},{"name":"TradingFee","optionality":0}],"AMMDelete":[{"name":"Asset","optionality":0},{"name":"Asset2","optionality":0}],"AMMDeposit":[{"name":"Asset","optionality":0},{"name":"Asset2","optionality":0},{"name":"Amount","optionality":1},{"name":"Amount2","optionality":1},{"name":"EPrice","optionality":1},{"name":"LPTokenOut","optionality":1},{"name":"TradingFee","optionality":1}],"AMMVote":[{"name":"Asset","optionality":0},{"name":"Asset2","optionality":0},{"name":"TradingFee","optionality":0}],"AMMWithdraw":[{"name":"Asset","optionality":0},{"name":"Asset2","optionality":0},{"name":"Amount","optionality":1},{"name":"Amount2","optionality":1},{"name":"EPrice","optionality":1},{"name":"LPTokenIn","optionality":1}],"AccountDelete":[{"name":"Destination","optionality":0},{"name":"DestinationTag","optionality":1},{"name":"CredentialIDs","optionality":1}],"AccountSet":[{"name":"EmailHash","optionality":1},{"name":"WalletLocator","optionality":1},{"name":"WalletSize","optionality":1},{"name":"MessageKey","optionality":1},{"name":"Domain","optionality":1},{"name":"TransferRate","optionality":1},{"name":"SetFlag","optionality":1},{"name":"ClearFlag","optionality":1},{"name":"TickSize","optionality":1},{"name":"NFTokenMinter","optionality":1}],"Batch":[{"name":"RawTransactions","optionality":0},{"name":"BatchSigners","optionality":1}],"CheckCancel":[{"name":"CheckID","optionality":0}],"CheckCash":[{"name":"CheckID","optionality":0},{"name":"Amount","optionality":1},{"name":"DeliverMin","optionality":1}],"CheckCreate":[{"name":"Destination","optionality":0},{"name":"SendMax","optionality":0},{"name":"Expiration","optionality":1},{"name":"DestinationTag","optionality":1},{"name":"InvoiceID","optionality":1}],"Clawback":[{"name":"Amount","optionality":0},{"name":"Holder","optionality":1}],"ConfidentialMPTClawback":[{"name":"MPTokenIssuanceID","optionality":0},{"name":"Holder","optionality":0},{"name":"MPTAmount","optionality":0},{"name":"ZKProof","optionality":0}],"ConfidentialMPTConvert":[{"name":"MPTokenIssuanceID","optionality":0},{"name":"MPTAmount","optionality":0},{"name":"HolderEncryptionKey","optionality":1},{"name":"HolderEncryptedAmount","optionality":0},{"name":"IssuerEncryptedAmount","optionality":0},{"name":"AuditorEncryptedAmount","optionality":1},{"name":"BlindingFactor","optionality":0},{"name":"ZKProof","optionality":1}],"ConfidentialMPTConvertBack":[{"name":"MPTokenIssuanceID","optionality":0},{"name":"MPTAmount","optionality":0},{"name":"HolderEncryptedAmount","optionality":0},{"name":"IssuerEncryptedAmount","optionality":0},{"name":"AuditorEncryptedAmount","optionality":1},{"name":"BlindingFactor","optionality":0},{"name":"ZKProof","optionality":0},{"name":"BalanceCommitment","optionality":0}],"ConfidentialMPTMergeInbox":[{"name":"MPTokenIssuanceID","optionality":0}],"ConfidentialMPTSend":[{"name":"MPTokenIssuanceID","optionality":0},{"name":"Destination","optionality":0},{"name":"DestinationTag","optionality":1},{"name":"SenderEncryptedAmount","optionality":0},{"name":"DestinationEncryptedAmount","optionality":0},{"name":"IssuerEncryptedAmount","optionality":0},{"name":"AuditorEncryptedAmount","optionality":1},{"name":"ZKProof","optionality":0},{"name":"AmountCommitment","optionality":0},{"name":"BalanceCommitment","optionality":0},{"name":"CredentialIDs","optionality":1}],"CredentialAccept":[{"name":"Issuer","optionality":0},{"name":"CredentialType","optionality":0}],"CredentialCreate":[{"name":"Subject","optionality":0},{"name":"CredentialType","optionality":0},{"name":"Expiration","optionality":1},{"name":"URI","optionality":1}],"CredentialDelete":[{"name":"Subject","optionality":1},{"name":"Issuer","optionality":1},{"name":"CredentialType","optionality":0}],"DIDDelete":[],"DIDSet":[{"name":"DIDDocument","optionality":1},{"name":"URI","optionality":1},{"name":"Data","optionality":1}],"DelegateSet":[{"name":"Authorize","optionality":0},{"name":"Permissions","optionality":0}],"DepositPreauth":[{"name":"Authorize","optionality":1},{"name":"Unauthorize","optionality":1},{"name":"AuthorizeCredentials","optionality":1},{"name":"UnauthorizeCredentials","optionality":1}],"EnableAmendment":[{"name":"LedgerSequence","optionality":0},{"name":"Amendment","optionality":0}],"EscrowCancel":[{"name":"Owner","optionality":0},{"name":"OfferSequence","optionality":0}],"EscrowCreate":[{"name":"Destination","optionality":0},{"name":"Amount","optionality":0},{"name":"Condition","optionality":1},{"name":"CancelAfter","optionality":1},{"name":"FinishAfter","optionality":1},{"name":"DestinationTag","optionality":1}],"EscrowFinish":[{"name":"Owner","optionality":0},{"name":"OfferSequence","optionality":0},{"name":"Fulfillment","optionality":1},{"name":"Condition","optionality":1},{"name":"CredentialIDs","optionality":1}],"LedgerStateFix":[{"name":"LedgerFixType","optionality":0},{"name":"Owner","optionality":1},{"name":"BookDirectory","optionality":1}],"LoanBrokerCoverClawback":[{"name":"LoanBrokerID","optionality":1},{"name":"Amount","optionality":1}],"LoanBrokerCoverDeposit":[{"name":"LoanBrokerID","optionality":0},{"name":"Amount","optionality":0}],"LoanBrokerCoverWithdraw":[{"name":"LoanBrokerID","optionality":0},{"name":"Amount","optionality":0},{"name":"Destination","optionality":1},{"name":"DestinationTag","optionality":1},{"name":"CredentialIDs","optionality":1}],"LoanBrokerDelete":[{"name":"LoanBrokerID","optionality":0}],"LoanBrokerSet":[{"name":"VaultID","optionality":0},{"name":"LoanBrokerID","optionality":1},{"name":"Data","optionality":1},{"name":"ManagementFeeRate","optionality":1},{"name":"DebtMaximum","optionality":1},{"name":"CoverRateMinimum","optionality":1},{"name":"CoverRateLiquidation","optionality":1}],"LoanDelete":[{"name":"LoanID","optionality":0}],"LoanManage":[{"name":"LoanID","optionality":0}],"LoanPay":[{"name":"LoanID","optionality":0},{"name":"Amount","optionality":0}],"LoanSet":[{"name":"LoanBrokerID","optionality":0},{"name":"Data","optionality":1},{"name":"Counterparty","optionality":1},{"name":"CounterpartySignature","optionality":1},{"name":"LoanOriginationFee","optionality":1},{"name":"LoanServiceFee","optionality":1},{"name":"LatePaymentFee","optionality":1},{"name":"ClosePaymentFee","optionality":1},{"name":"OverpaymentFee","optionality":1},{"name":"InterestRate","optionality":1},{"name":"LateInterestRate","optionality":1},{"name":"CloseInterestRate","optionality":1},{"name":"OverpaymentInterestRate","optionality":1},{"name":"PrincipalRequested","optionality":0},{"name":"PaymentTotal","optionality":1},{"name":"PaymentInterval","optionality":1},{"name":"GracePeriod","optionality":1}],"MPTokenAuthorize":[{"name":"MPTokenIssuanceID","optionality":0},{"name":"Holder","optionality":1}],"MPTokenIssuanceCreate":[{"name":"AssetScale","optionality":1},{"name":"TransferFee","optionality":1},{"name":"MaximumAmount","optionality":1},{"name":"MPTokenMetadata","optionality":1},{"name":"DomainID","optionality":1},{"name":"ImmutableFlags","optionality":1}],"MPTokenIssuanceDestroy":[{"name":"MPTokenIssuanceID","optionality":0}],"MPTokenIssuanceSet":[{"name":"MPTokenIssuanceID","optionality":0},{"name":"Holder","optionality":1},{"name":"DomainID","optionality":1},{"name":"MPTokenMetadata","optionality":1},{"name":"TransferFee","optionality":1},{"name":"ImmutableFlags","optionality":1},{"name":"IssuerEncryptionKey","optionality":1},{"name":"AuditorEncryptionKey","optionality":1}],"NFTokenAcceptOffer":[{"name":"NFTokenBuyOffer","optionality":1},{"name":"NFTokenSellOffer","optionality":1},{"name":"NFTokenBrokerFee","optionality":1}],"NFTokenBurn":[{"name":"NFTokenID","optionality":0},{"name":"Owner","optionality":1}],"NFTokenCancelOffer":[{"name":"NFTokenOffers","optionality":0}],"NFTokenCreateOffer":[{"name":"NFTokenID","optionality":0},{"name":"Amount","optionality":0},{"name":"Destination","optionality":1},{"name":"Owner","optionality":1},{"name":"Expiration","optionality":1}],"NFTokenMint":[{"name":"NFTokenTaxon","optionality":0},{"name":"TransferFee","optionality":1},{"name":"Issuer","optionality":1},{"name":"URI","optionality":1},{"name":"Amount","optionality":1},{"name":"Destination","optionality":1},{"name":"Expiration","optionality":1}],"NFTokenModify":[{"name":"NFTokenID","optionality":0},{"name":"Owner","optionality":1},{"name":"URI","optionality":1}],"OfferCancel":[{"name":"OfferSequence","optionality":0}],"OfferCreate":[{"name":"TakerPays","optionality":0},{"name":"TakerGets","optionality":0},{"name":"Expiration","optionality":1},{"name":"OfferSequence","optionality":1},{"name":"DomainID","optionality":1}],"OracleDelete":[{"name":"OracleDocumentID","optionality":0}],"OracleSet":[{"name":"OracleDocumentID","optionality":0},{"name":"Provider","optionality":1},{"name":"URI","optionality":1},{"name":"AssetClass","optionality":1},{"name":"LastUpdateTime","optionality":0},{"name":"PriceDataSeries","optionality":0}],"Payment":[{"name":"Destination","optionality":0},{"name":"Amount","optionality":0},{"name":"SendMax","optionality":1},{"name":"Paths","optionality":2},{"name":"InvoiceID","optionality":1},{"name":"DestinationTag","optionality":1},{"name":"DeliverMin","optionality":1},{"name":"CredentialIDs","optionality":1},{"name":"DomainID","optionality":1}],"PaymentChannelClaim":[{"name":"Channel","optionality":0},{"name":"Amount","optionality":1},{"name":"Balance","optionality":1},{"name":"Signature","optionality":1},{"name":"PublicKey","optionality":1},{"name":"CredentialIDs","optionality":1}],"PaymentChannelCreate":[{"name":"Destination","optionality":0},{"name":"Amount","optionality":0},{"name":"SettleDelay","optionality":0},{"name":"PublicKey","optionality":0},{"name":"CancelAfter","optionality":1},{"name":"DestinationTag","optionality":1}],"PaymentChannelFund":[{"name":"Channel","optionality":0},{"name":"Amount","optionality":0},{"name":"Expiration","optionality":1}],"PermissionedDomainDelete":[{"name":"DomainID","optionality":0}],"PermissionedDomainSet":[{"name":"DomainID","optionality":1},{"name":"AcceptedCredentials","optionality":0}],"SetFee":[{"name":"LedgerSequence","optionality":1},{"name":"BaseFee","optionality":1},{"name":"ReferenceFeeUnits","optionality":1},{"name":"ReserveBase","optionality":1},{"name":"ReserveIncrement","optionality":1},{"name":"BaseFeeDrops","optionality":1},{"name":"ReserveBaseDrops","optionality":1},{"name":"ReserveIncrementDrops","optionality":1}],"SetRegularKey":[{"name":"RegularKey","optionality":1}],"SignerListSet":[{"name":"SignerQuorum","optionality":0},{"name":"SignerEntries","optionality":1}],"SponsorshipSet":[{"name":"CounterpartySponsor","optionality":1},{"name":"Sponsee","optionality":1},{"name":"FeeAmountDelta","optionality":1},{"name":"MaxFee","optionality":1},{"name":"RemainingOwnerCountDelta","optionality":1}],"SponsorshipTransfer":[{"name":"ObjectID","optionality":1},{"name":"Sponsee","optionality":1}],"TicketCreate":[{"name":"TicketCount","optionality":0}],"TrustSet":[{"name":"LimitAmount","optionality":1},{"name":"QualityIn","optionality":1},{"name":"QualityOut","optionality":1}],"UNLModify":[{"name":"UNLModifyDisabling","optionality":0},{"name":"LedgerSequence","optionality":0},{"name":"UNLModifyValidator","optionality":0}],"VaultClawback":[{"name":"VaultID","optionality":0},{"name":"Holder","optionality":0},{"name":"Amount","optionality":1}],"VaultCreate":[{"name":"Asset","optionality":0},{"name":"AssetsMaximum","optionality":1},{"name":"MPTokenMetadata","optionality":1},{"name":"DomainID","optionality":1},{"name":"WithdrawalPolicy","optionality":1},{"name":"Data","optionality":1},{"name":"Scale","optionality":1},{"name":"VaultKind","optionality":1},{"name":"SubscriptionDate","optionality":1},{"name":"RedemptionDate","optionality":1}],"VaultDelete":[{"name":"VaultID","optionality":0},{"name":"MemoData","optionality":1}],"VaultDeposit":[{"name":"VaultID","optionality":0},{"name":"Amount","optionality":0}],"VaultSet":[{"name":"VaultID","optionality":0},{"name":"AssetsMaximum","optionality":1},{"name":"DomainID","optionality":1},{"name":"Data","optionality":1}],"VaultWithdraw":[{"name":"VaultID","optionality":0},{"name":"Amount","optionality":0},{"name":"Destination","optionality":1},{"name":"DestinationTag","optionality":1},{"name":"CredentialIDs","optionality":1}],"XChainAccountCreateCommit":[{"name":"XChainBridge","optionality":0},{"name":"Destination","optionality":0},{"name":"Amount","optionality":0},{"name":"SignatureReward","optionality":0}],"XChainAddAccountCreateAttestation":[{"name":"XChainBridge","optionality":0},{"name":"AttestationSignerAccount","optionality":0},{"name":"PublicKey","optionality":0},{"name":"Signature","optionality":0},{"name":"OtherChainSource","optionality":0},{"name":"Amount","optionality":0},{"name":"AttestationRewardAccount","optionality":0},{"name":"WasLockingChainSend","optionality":0},{"name":"XChainAccountCreateCount","optionality":0},{"name":"Destination","optionality":0},{"name":"SignatureReward","optionality":0}],"XChainAddClaimAttestation":[{"name":"XChainBridge","optionality":0},{"name":"AttestationSignerAccount","optionality":0},{"name":"PublicKey","optionality":0},{"name":"Signature","optionality":0},{"name":"OtherChainSource","optionality":0},{"name":"Amount","optionality":0},{"name":"AttestationRewardAccount","optionality":0},{"name":"WasLockingChainSend","optionality":0},{"name":"XChainClaimID","optionality":0},{"name":"Destination","optionality":1}],"XChainClaim":[{"name":"XChainBridge","optionality":0},{"name":"XChainClaimID","optionality":0},{"name":"Destination","optionality":0},{"name":"DestinationTag","optionality":1},{"name":"Amount","optionality":0}],"XChainCommit":[{"name":"XChainBridge","optionality":0},{"name":"XChainClaimID","optionality":0},{"name":"Amount","optionality":0},{"name":"OtherChainDestination","optionality":1}],"XChainCreateBridge":[{"name":"XChainBridge","optionality":0},{"name":"SignatureReward","optionality":0},{"name":"MinAccountCreateAmount","optionality":1}],"XChainCreateClaimID":[{"name":"XChainBridge","optionality":0},{"name":"SignatureReward","optionality":0},{"name":"OtherChainSource","optionality":0}],"XChainModifyBridge":[{"name":"XChainBridge","optionality":0},{"name":"SignatureReward","optionality":1},{"name":"MinAccountCreateAmount","optionality":1}],"common":[{"name":"TransactionType","optionality":0},{"name":"Flags","optionality":1},{"name":"SourceTag","optionality":1},{"name":"Account","optionality":0},{"name":"Sequence","optionality":0},{"name":"PreviousTxnID","optionality":1},{"name":"LastLedgerSequence","optionality":1},{"name":"AccountTxnID","optionality":1},{"name":"Fee","optionality":0},{"name":"OperationLimit","optionality":1},{"name":"Memos","optionality":1},{"name":"SigningPubKey","optionality":0},{"name":"TicketSequence","optionality":1},{"name":"TxnSignature","optionality":1},{"name":"Signers","optionality":1},{"name":"NetworkID","optionality":1},{"name":"Delegate","optionality":1},{"name":"Sponsor","optionality":1},{"name":"SponsorFlags","optionality":1},{"name":"SponsorSignature","optionality":1}]}'), Hr = { tecAMM_ACCOUNT: 168, tecAMM_BALANCE: 163, tecAMM_EMPTY: 166, tecAMM_FAILED: 164, tecAMM_INVALID_TOKENS: 165, tecAMM_NOT_EMPTY: 167, tecARRAY_EMPTY: 190, tecARRAY_TOO_LARGE: 191, tecBAD_CREDENTIALS: 193, tecBAD_PROOF: 199, tecCANT_ACCEPT_OWN_NFTOKEN_OFFER: 158, tecCLAIM: 100, tecCRYPTOCONDITION_ERROR: 146, tecDIR_FULL: 121, tecDST_TAG_NEEDED: 143, tecDUPLICATE: 149, tecEMPTY_DID: 187, tecEXPIRED: 148, tecFAILED_PROCESSING: 105, tecFROZEN: 137, tecHAS_OBLIGATIONS: 151, tecINCOMPLETE: 169, tecINSUFFICIENT_FUNDS: 159, tecINSUFFICIENT_PAYMENT: 161, tecINSUFFICIENT_RESERVE: 141, tecINSUFF_FEE: 136, tecINSUF_RESERVE_LINE: 122, tecINSUF_RESERVE_OFFER: 123, tecINTERNAL: 144, tecINVALID_UPDATE_TIME: 188, tecINVARIANT_FAILED: 147, tecKILLED: 150, tecLIMIT_EXCEEDED: 195, tecLOCKED: 192, tecMAX_SEQUENCE_REACHED: 154, tecNEED_MASTER_KEY: 142, tecNFTOKEN_BUY_SELL_MISMATCH: 156, tecNFTOKEN_OFFER_TYPE_MISMATCH: 157, tecNO_ALTERNATIVE_KEY: 130, tecNO_AUTH: 134, tecNO_DST: 124, tecNO_DST_INSUF_XRP: 125, tecNO_ENTRY: 140, tecNO_ISSUER: 133, tecNO_LINE: 135, tecNO_LINE_INSUF_RESERVE: 126, tecNO_LINE_REDUNDANT: 127, tecNO_PERMISSION: 139, tecNO_REGULAR_KEY: 131, tecNO_SPONSOR_PERMISSION: 200, tecNO_SUITABLE_NFTOKEN_PAGE: 155, tecNO_TARGET: 138, tecOBJECT_NOT_FOUND: 160, tecOVERSIZE: 145, tecOWNERS: 132, tecPATH_DRY: 128, tecPATH_PARTIAL: 101, tecPRECISION_LOSS: 197, tecPSEUDO_ACCOUNT: 196, tecTOKEN_PAIR_NOT_FOUND: 189, tecTOO_SOON: 152, tecUNFUNDED: 129, tecUNFUNDED_ADD: 102, tecUNFUNDED_AMM: 162, tecUNFUNDED_OFFER: 103, tecUNFUNDED_PAYMENT: 104, tecWRONG_ASSET: 194, tecXCHAIN_ACCOUNT_CREATE_PAST: 181, tecXCHAIN_ACCOUNT_CREATE_TOO_MANY: 182, tecXCHAIN_BAD_CLAIM_ID: 172, tecXCHAIN_BAD_PUBLIC_KEY_ACCOUNT_PAIR: 185, tecXCHAIN_BAD_TRANSFER_ISSUE: 170, tecXCHAIN_CLAIM_NO_QUORUM: 173, tecXCHAIN_CREATE_ACCOUNT_DISABLED: 186, tecXCHAIN_CREATE_ACCOUNT_NONXRP_ISSUE: 175, tecXCHAIN_INSUFF_CREATE_AMOUNT: 180, tecXCHAIN_NO_CLAIM_ID: 171, tecXCHAIN_NO_SIGNERS_LIST: 178, tecXCHAIN_PAYMENT_FAILED: 183, tecXCHAIN_PROOF_UNKNOWN_KEY: 174, tecXCHAIN_REWARD_MISMATCH: 177, tecXCHAIN_SELF_COMMIT: 184, tecXCHAIN_SENDING_ACCOUNT_MISMATCH: 179, tecXCHAIN_WRONG_CHAIN: 176, tefALREADY: -198, tefBAD_ADD_AUTH: -197, tefBAD_AUTH: -196, tefBAD_AUTH_MASTER: -183, tefBAD_LEDGER: -195, tefBAD_PATH_COUNT: -176, tefBAD_QUORUM: -185, tefBAD_SIGNATURE: -186, tefCREATED: -194, tefEXCEPTION: -193, tefFAILURE: -199, tefINTERNAL: -192, tefINVALID_LEDGER_FIX_TYPE: -178, tefINVARIANT_FAILED: -182, tefMASTER_DISABLED: -188, tefMAX_LEDGER: -187, tefNFTOKEN_IS_NOT_TRANSFERABLE: -179, tefNOT_MULTI_SIGNING: -184, tefNO_AUTH_REQUIRED: -191, tefNO_DST_PARTIAL: -177, tefNO_TICKET: -180, tefPAST_SEQ: -190, tefTOO_BIG: -181, tefWRONG_PRIOR: -189, telBAD_DOMAIN: -398, telBAD_PATH_COUNT: -397, telBAD_PUBLIC_KEY: -396, telCAN_NOT_QUEUE: -392, telCAN_NOT_QUEUE_BALANCE: -391, telCAN_NOT_QUEUE_BLOCKED: -389, telCAN_NOT_QUEUE_BLOCKS: -390, telCAN_NOT_QUEUE_FEE: -388, telCAN_NOT_QUEUE_FULL: -387, telENV_RPC_FAILED: -383, telFAILED_PROCESSING: -395, telINSUF_FEE_P: -394, telLOCAL_ERROR: -399, telNETWORK_ID_MAKES_TX_NON_CANONICAL: -384, telNO_DST_PARTIAL: -393, telREQUIRES_NETWORK_ID: -385, telWRONG_NETWORK: -386, temARRAY_EMPTY: -253, temARRAY_TOO_LARGE: -252, temBAD_AMM_TOKENS: -261, temBAD_AMOUNT: -298, temBAD_CIPHERTEXT: -248, temBAD_CURRENCY: -297, temBAD_EXPIRATION: -296, temBAD_FEE: -295, temBAD_ISSUER: -294, temBAD_LIMIT: -293, temBAD_MPT: -249, temBAD_NFTOKEN_TRANSFER_FEE: -262, temBAD_OFFER: -292, temBAD_PATH: -291, temBAD_PATH_LOOP: -290, temBAD_QUORUM: -271, temBAD_REGKEY: -289, temBAD_SEND_XRP_LIMIT: -288, temBAD_SEND_XRP_MAX: -287, temBAD_SEND_XRP_NO_DIRECT: -286, temBAD_SEND_XRP_PARTIAL: -285, temBAD_SEND_XRP_PATHS: -284, temBAD_SEQUENCE: -283, temBAD_SIGNATURE: -282, temBAD_SIGNER: -272, temBAD_SRC_ACCOUNT: -281, temBAD_TICK_SIZE: -269, temBAD_TRANSFER_FEE: -251, temBAD_TRANSFER_RATE: -280, temBAD_WEIGHT: -270, temCANNOT_PREAUTH_SELF: -267, temDISABLED: -273, temDST_IS_SRC: -279, temDST_NEEDED: -278, temEMPTY_DID: -254, temINVALID: -277, temINVALID_ACCOUNT_ID: -268, temINVALID_COUNT: -266, temINVALID_FLAG: -276, temINVALID_INNER_BATCH: -250, temMALFORMED: -299, temREDUNDANT: -275, temRIPPLE_EMPTY: -274, temSEQ_AND_TICKET: -263, temUNCERTAIN: -265, temUNKNOWN: -264, temXCHAIN_BAD_PROOF: -259, temXCHAIN_BRIDGE_BAD_ISSUES: -258, temXCHAIN_BRIDGE_BAD_MIN_ACCOUNT_CREATE_AMOUNT: -256, temXCHAIN_BRIDGE_BAD_REWARD_AMOUNT: -255, temXCHAIN_BRIDGE_NONDOOR_OWNER: -257, temXCHAIN_EQUAL_DOOR_ACCOUNTS: -260, terADDRESS_COLLISION: -86, terFUNDS_SPENT: -98, terINSUF_FEE_B: -97, terLAST: -91, terLOCKED: -84, terNO_ACCOUNT: -96, terNO_AMM: -87, terNO_AUTH: -95, terNO_DELEGATE_PERMISSION: -85, terNO_LINE: -94, terNO_PERMISSION: -83, terNO_RIPPLE: -90, terOWNERS: -93, terPRE_SEQ: -92, terPRE_TICKET: -88, terQUEUED: -89, terRETRY: -99, tesSUCCESS: 0 }, kr = { AMMBid: 39, AMMClawback: 31, AMMCreate: 35, AMMDelete: 40, AMMDeposit: 36, AMMVote: 38, AMMWithdraw: 37, AccountDelete: 21, AccountSet: 3, Batch: 71, CheckCancel: 18, CheckCash: 17, CheckCreate: 16, Clawback: 30, ConfidentialMPTClawback: 89, ConfidentialMPTConvert: 85, ConfidentialMPTConvertBack: 87, ConfidentialMPTMergeInbox: 86, ConfidentialMPTSend: 88, CredentialAccept: 59, CredentialCreate: 58, CredentialDelete: 60, DIDDelete: 50, DIDSet: 49, DelegateSet: 64, DepositPreauth: 19, EnableAmendment: 100, EscrowCancel: 4, EscrowCreate: 1, EscrowFinish: 2, Invalid: -1, LedgerStateFix: 53, LoanBrokerCoverClawback: 78, LoanBrokerCoverDeposit: 76, LoanBrokerCoverWithdraw: 77, LoanBrokerDelete: 75, LoanBrokerSet: 74, LoanDelete: 81, LoanManage: 82, LoanPay: 84, LoanSet: 80, MPTokenAuthorize: 57, MPTokenIssuanceCreate: 54, MPTokenIssuanceDestroy: 55, MPTokenIssuanceSet: 56, NFTokenAcceptOffer: 29, NFTokenBurn: 26, NFTokenCancelOffer: 28, NFTokenCreateOffer: 27, NFTokenMint: 25, NFTokenModify: 61, OfferCancel: 8, OfferCreate: 7, OracleDelete: 52, OracleSet: 51, Payment: 0, PaymentChannelClaim: 15, PaymentChannelCreate: 13, PaymentChannelFund: 14, PermissionedDomainDelete: 63, PermissionedDomainSet: 62, SetFee: 101, SetRegularKey: 5, SignerListSet: 12, SponsorshipSet: 91, SponsorshipTransfer: 90, TicketCreate: 10, TrustSet: 20, UNLModify: 102, VaultClawback: 70, VaultCreate: 65, VaultDelete: 67, VaultDeposit: 68, VaultSet: 66, VaultWithdraw: 69, XChainAccountCreateCommit: 44, XChainAddAccountCreateAttestation: 46, XChainAddClaimAttestation: 45, XChainClaim: 43, XChainCommit: 42, XChainCreateBridge: 48, XChainCreateClaimID: 41, XChainModifyBridge: 47 }, jr = { AccountID: 8, Amount: 6, Blob: 7, Currency: 26, Done: -1, Hash128: 4, Hash160: 17, Hash192: 21, Hash256: 5, Hash384: 22, Hash512: 23, Int32: 10, Int64: 11, Issue: 24, LedgerEntry: 10002, Metadata: 10004, NotPresent: 0, Number: 9, PathSet: 18, STArray: 15, STObject: 14, Transaction: 10001, UInt16: 1, UInt32: 2, UInt64: 3, UInt8: 16, UInt96: 20, Unknown: -2, Validation: 10003, Vector256: 19, XChainBridge: 25 }, qr = "0F89957938A9185335A2ACD799EDDF3965F349E2E482A0CDD97094A1E4DB9FE7", Xr = {
  ACCOUNT_SET_FLAGS: xr,
  FIELDS: Ur,
  LEDGER_ENTRY_FLAGS: Rr,
  LEDGER_ENTRY_FORMATS: Mr,
  LEDGER_ENTRY_TYPES: Vr,
  TRANSACTION_FLAGS: zr,
  TRANSACTION_FORMATS: vr,
  TRANSACTION_RESULTS: Hr,
  TRANSACTION_TYPES: kr,
  TYPES: jr,
  hash: qr
};
var en = {}, Be = {}, _n;
function Vi() {
  if (_n) return Be;
  _n = 1, Object.defineProperty(Be, "__esModule", { value: !0 }), Be.BytesLookup = Be.Bytes = void 0;
  class e {
    constructor(r, t, o) {
      this.name = r, this.ordinal = t, this.ordinalWidth = o, this.bytes = new Uint8Array(o);
      for (let a = 0; a < o; a++)
        this.bytes[o - a - 1] = t >>> a * 8 & 255;
    }
    toJSON() {
      return this.name;
    }
    toBytesSink(r) {
      r.put(this.bytes);
    }
    toBytes() {
      return this.bytes;
    }
  }
  Be.Bytes = e;
  class i {
    constructor(r, t) {
      this.ordinalWidth = t, Object.entries(r).forEach(([o, a]) => {
        this.add(o, a);
      });
    }
    /**
     * Add a new name value pair to the BytesLookup.
     *
     * @param name - A human readable name for the field.
     * @param value - The numeric value for the field.
     * @throws if the name or value already exist in the lookup because it's unclear how to decode.
     */
    add(r, t) {
      if (this[r])
        throw new SyntaxError(`Attempted to add a value with a duplicate name "${r}". This is not allowed because it is unclear how to decode.`);
      if (this[t.toString()])
        throw new SyntaxError(`Attempted to add a duplicate value under a different name (Given name: "${r}" and previous name: "${this[t.toString()]}. This is not allowed because it is unclear how to decode.
Given value: ${t.toString()}`);
      this[r] = new e(r, t, this.ordinalWidth), this[t.toString()] = this[r];
    }
    from(r) {
      return r instanceof e ? r : this[r];
    }
    fromParser(r) {
      return this.from(r.readUIntN(this.ordinalWidth).toString());
    }
  }
  return Be.BytesLookup = i, Be;
}
var tt = {}, xe = {}, Ue = {}, Re = {};
function sn(e) {
  return e instanceof Uint8Array || ArrayBuffer.isView(e) && e.constructor.name === "Uint8Array" && "BYTES_PER_ELEMENT" in e && e.BYTES_PER_ELEMENT === 1;
}
const zt = (e) => e ? `"${e}" ` : "";
function je(e, i = "") {
  if (typeof e != "number")
    throw new TypeError(zt(i) + "expected number, got " + typeof e);
  if (!Number.isSafeInteger(e) || e < 0)
    throw new RangeError(zt(i) + "expected integer >= 0, got " + e);
  return e;
}
function $r(e, i = "") {
  if (typeof e != "boolean")
    throw new TypeError(zt(i) + "expected boolean, got type=" + typeof e);
  return e;
}
function qe(e, i, n = "") {
  if (sn(e) && (i === void 0 || e.length === i))
    return e;
  i !== void 0 && je(i, "length");
  const r = sn(e), t = i !== void 0 ? ` of length ${i}` : "", o = r ? `length=${e.length}` : `type=${typeof e}`, a = zt(n) + "expected Uint8Array" + t + ", got " + o;
  throw r ? new RangeError(a) : new TypeError(a);
}
function Gr(e) {
  return Uint8Array.from(qe(e));
}
function Kr(e) {
  if (typeof e != "function" || typeof e.create != "function")
    throw new TypeError("expected hash wrapped by utils.createHasher");
  if (je(e.outputLen), je(e.blockLen), e.outputLen < 1 || e.blockLen < 1)
    throw new Error("hash blockLen / outputLen must be >= 1");
}
const Mt = (e, i) => {
  if (e === null || typeof e != "object" || Array.isArray(e))
    throw new TypeError((i === "object" ? "" : `"${i}" `) + "expected object, got type=" + typeof e);
}, wn = (e, i) => {
  Mt(e, i);
  const n = Object.getPrototypeOf(e);
  if (n !== Object.prototype && n !== null)
    throw new TypeError(`"${i}" expected plain object`);
  if (Object.hasOwn(e, "__proto__"))
    throw new TypeError(`"${i}.__proto__" is not allowed`);
};
function cn(e, i = !0) {
  if (e.destroyed)
    throw new Error("hash was destroyed");
  if (i && e.finished)
    throw new Error("digest() was already called");
}
function zi(e, i) {
  qe(e, void 0, "output");
  const n = i.outputLen;
  if (!(e.length >= n))
    throw new RangeError('"output" expected length >= ' + n);
}
function Wr(e) {
  return new Uint8Array(e.buffer, e.byteOffset, e.byteLength);
}
function Yr(e) {
  return new Uint32Array(e.buffer, e.byteOffset, Math.floor(e.byteLength / 4));
}
function Qe(...e) {
  for (let i = 0; i < e.length; i++)
    e[i].fill(0);
}
function Vt(e) {
  return new DataView(e.buffer, e.byteOffset, e.byteLength);
}
function me(e, i) {
  return e << 32 - i | e >>> i;
}
function Jr(e, i) {
  return e << i | e >>> 32 - i >>> 0;
}
const fn = new Uint8Array(new Uint32Array([287454020]).buffer)[0] === 68;
function yn(e) {
  return e << 24 & 4278190080 | e << 8 & 16711680 | e >>> 8 & 65280 | e >>> 24 & 255;
}
const Qr = fn ? (e) => e : (e) => yn(e) >>> 0;
function vi(e) {
  for (let i = 0; i < e.length; i++)
    e[i] = yn(e[i]);
  return e;
}
const Zr = fn ? (e) => e : vi, Hi = /* @ts-ignore */ typeof Uint8Array.from([]).toHex == "function" && typeof Uint8Array.fromHex == "function", eo = /* @__PURE__ */ Array.from({ length: 256 }, (e, i) => i.toString(16).padStart(2, "0"));
function to(e) {
  if (qe(e), Hi)
    return e.toHex();
  let i = "";
  for (let n = 0; n < e.length; n++)
    i += eo[e[n]];
  return i;
}
function Ln(e) {
  return e >= 48 && e <= 57 ? e - 48 : e >= 65 && e <= 70 ? e - 55 : e >= 97 && e <= 102 ? e - 87 : void 0;
}
function no(e) {
  if (typeof e != "string")
    throw new TypeError("hex string expected, got " + typeof e);
  if (Hi)
    try {
      return Uint8Array.fromHex(e);
    } catch (t) {
      throw t instanceof SyntaxError ? new RangeError(t.message) : t;
    }
  const i = e.length, n = i / 2;
  if (i % 2)
    throw new RangeError("hex string expected, got unpadded hex of length " + i);
  const r = new Uint8Array(n);
  for (let t = 0, o = 0; t < n; t++, o += 2) {
    const a = Ln(e.charCodeAt(o)), d = Ln(e.charCodeAt(o + 1));
    if (a === void 0 || d === void 0) {
      const f = e[o] + e[o + 1];
      throw new RangeError('hex string expected, got non-hex character "' + f + '" at index ' + o);
    }
    r[t] = a * 16 + d;
  }
  return r;
}
function ki(e) {
  const i = globalThis;
  if (typeof i.scheduler?.yield == "function") {
    const n = i.scheduler.yield();
    return e && n.catch(e), n;
  }
  return new Promise((n) => i.setTimeout(n, 0));
}
async function io(e, i, n, r) {
  if (je(e, "iters"), je(i, "tick"), typeof n != "function")
    throw new TypeError("callback must be a function");
  let t = Date.now();
  for (let o = 0; o < e; o++) {
    n(o);
    const a = Date.now() - t;
    a >= 0 && a < i || (await ki(r), t = Date.now());
  }
}
function ji(e) {
  if (typeof e != "string")
    throw new TypeError("string expected");
  const i = new TextEncoder().encode(e);
  try {
    return new Uint8Array(i);
  } finally {
    Qe(i);
  }
}
function ro(e, i = "") {
  return typeof e == "string" ? ji(e) : qe(e, void 0, i);
}
function oo(...e) {
  let i = 0;
  for (let r = 0; r < e.length; r++) {
    const t = e[r];
    qe(t), i += t.length;
  }
  const n = new Uint8Array(i);
  for (let r = 0, t = 0; r < e.length; r++) {
    const o = e[r];
    n.set(o, t), t += o.length;
  }
  return n;
}
const ao = (e, i = {}, n = {}, r = "object") => {
  Mt(e, r), Mt(i, "fields"), Mt(n, "optFields");
  function t(a, d, f) {
    const m = r === "object" ? `param "${String(a)}"` : `"${r}.${String(a)}"`, T = e[a];
    if (!Object.hasOwn(e, a) && (f ? T !== void 0 : d !== "function"))
      throw new TypeError(`${m} is invalid: expected own property`);
    if (f && T === void 0)
      return;
    const A = typeof T;
    if (A !== d || T === null)
      throw new TypeError(`${m} is invalid: expected ${d}, got ${A}`);
  }
  const o = (a, d) => Object.entries(a).forEach(([f, m]) => t(f, m, d));
  o(i, !1), o(n, !0);
};
function qi(e, i, n = "opts") {
  return wn(e, "defaults"), i !== void 0 && wn(i, n), Object.assign(/* @__PURE__ */ Object.create(null), e, i);
}
function Xe(e, i = {}) {
  if (typeof e != "function")
    throw new TypeError('"hashCons" expected function, got type=' + typeof e);
  i = qi({}, i, "info");
  const n = (t, o) => e(o).update(t).digest(), r = e(void 0);
  return n.outputLen = r.outputLen, n.blockLen = r.blockLen, n.canXOF = r.canXOF, n.create = (t) => e(t), Object.assign(n, i), Object.freeze(n);
}
function so(e = 32) {
  je(e, "bytesLength");
  const i = typeof globalThis == "object" ? globalThis.crypto : null;
  if (typeof i?.getRandomValues != "function")
    throw new Error("crypto.getRandomValues must be defined");
  if (e > 65536)
    throw new RangeError(`"bytesLength" expected <= 65536, got ${e}`);
  return i.getRandomValues(new Uint8Array(e));
}
const $e = (e) => ({
  // Current NIST hashAlgs suffixes used here fit in one DER subidentifier octet.
  // Larger suffix values would need base-128 OID encoding and a different length byte.
  oid: Uint8Array.from([6, 9, 96, 134, 72, 1, 101, 3, 4, 2, e])
}), co = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  abool: $r,
  abytes: qe,
  aexists: cn,
  ahash: Kr,
  anumber: je,
  aoutput: zi,
  asyncLoop: io,
  byteSwap: yn,
  byteSwap32: vi,
  bytesToHex: to,
  checkOpts: qi,
  clean: Qe,
  concatBytes: oo,
  copyBytes: Gr,
  createHasher: Xe,
  createView: Vt,
  hexToBytes: no,
  isBytes: sn,
  isLE: fn,
  kdfInputToBytes: ro,
  nextTick: ki,
  oidNist: $e,
  randomBytes: so,
  rotl: Jr,
  rotr: me,
  swap32IfBE: Zr,
  swap8IfBE: Qr,
  u32: Yr,
  u8: Wr,
  utf8ToBytes: ji,
  validateObject: ao
}, Symbol.toStringTag, { value: "Module" })), hn = /* @__PURE__ */ dn(co);
var be = {}, Dn;
function On() {
  if (Dn) return be;
  Dn = 1, Object.defineProperty(be, "__esModule", { value: !0 }), be.equal = be.concat = be.HEX_REGEX = void 0;
  const e = hn;
  be.HEX_REGEX = /^[A-F0-9]*$/iu;
  function i(r) {
    return (0, e.concatBytes)(...r);
  }
  be.concat = i;
  function n(r, t) {
    if (r.byteLength !== t.byteLength)
      return !1;
    const o = new Int8Array(r), a = new Int8Array(t);
    for (let d = 0; d !== r.byteLength; d++)
      if (o[d] !== a[d])
        return !1;
    return !0;
  }
  return be.equal = n, be;
}
var Fn;
function te() {
  return Fn || (Fn = 1, (function(e) {
    var i = Re && Re.__createBinding || (Object.create ? (function(m, T, A, c) {
      c === void 0 && (c = A);
      var y = Object.getOwnPropertyDescriptor(T, A);
      (!y || ("get" in y ? !T.__esModule : y.writable || y.configurable)) && (y = { enumerable: !0, get: function() {
        return T[A];
      } }), Object.defineProperty(m, c, y);
    }) : (function(m, T, A, c) {
      c === void 0 && (c = A), m[c] = T[A];
    })), n = Re && Re.__exportStar || function(m, T) {
      for (var A in m) A !== "default" && !Object.prototype.hasOwnProperty.call(T, A) && i(T, m, A);
    };
    Object.defineProperty(e, "__esModule", { value: !0 }), e.randomBytes = e.stringToHex = e.hexToString = e.hexToBytes = e.bytesToHex = void 0;
    const r = hn, t = On(), o = (m) => (0, r.bytesToHex)(m instanceof Uint8Array ? m : Uint8Array.from(m)).toUpperCase();
    e.bytesToHex = o;
    const a = (m) => {
      const T = m.length, A = new Uint8Array(T / 2);
      if (!t.HEX_REGEX.test(m))
        throw new Error("Invalid hex string");
      for (let c = 0; c < A.length; c++) {
        const y = c * 2, b = m.slice(y, y + 2), E = Number.parseInt(b, 16);
        if (Number.isNaN(E) || E < 0)
          throw new Error("Invalid byte sequence");
        A[c] = E;
      }
      return A;
    };
    e.hexToBytes = a;
    const d = (m, T = "utf8") => new TextDecoder(T).decode((0, e.hexToBytes)(m));
    e.hexToString = d;
    const f = (m) => (0, e.bytesToHex)(new TextEncoder().encode(m));
    e.stringToHex = f, e.randomBytes = r.randomBytes, n(On(), e);
  })(Re)), Re;
}
var Nn;
function Ft() {
  if (Nn) return Ue;
  Nn = 1, Object.defineProperty(Ue, "__esModule", { value: !0 }), Ue.BinarySerializer = Ue.BytesList = void 0;
  const e = te();
  class i {
    constructor() {
      this.bytesArray = [];
    }
    /**
     * Get the total number of bytes in the BytesList
     *
     * @return the number of bytes
     */
    getLength() {
      return (0, e.concat)(this.bytesArray).byteLength;
    }
    /**
     * Put bytes in the BytesList
     *
     * @param bytesArg A Uint8Array
     * @return this BytesList
     */
    put(t) {
      const o = Uint8Array.from(t);
      return this.bytesArray.push(o), this;
    }
    /**
     * Write this BytesList to the back of another bytes list
     *
     *  @param list The BytesList to write to
     */
    toBytesSink(t) {
      t.put(this.toBytes());
    }
    toBytes() {
      return (0, e.concat)(this.bytesArray);
    }
    toHex() {
      return (0, e.bytesToHex)(this.toBytes());
    }
  }
  Ue.BytesList = i;
  class n {
    constructor(t) {
      this.sink = new i(), this.sink = t;
    }
    /**
     * Write a value to this BinarySerializer
     *
     * @param value a SerializedType value
     */
    write(t) {
      t.toBytesSink(this.sink);
    }
    /**
     * Write bytes to this BinarySerializer
     *
     * @param bytes the bytes to write
     */
    put(t) {
      this.sink.put(t);
    }
    /**
     * Write a value of a given type to this BinarySerializer
     *
     * @param type the type to write
     * @param value a value of that type
     */
    writeType(t, o) {
      this.write(t.from(o));
    }
    /**
     * Write BytesList to this BinarySerializer
     *
     * @param bl BytesList to write to BinarySerializer
     */
    writeBytesList(t) {
      t.toBytesSink(this.sink);
    }
    /**
     * Calculate the header of Variable Length encoded bytes
     *
     * @param length the length of the bytes
     */
    encodeVariableLength(t) {
      const o = new Uint8Array(3);
      if (t <= 192)
        return o[0] = t, o.slice(0, 1);
      if (t <= 12480)
        return t -= 193, o[0] = 193 + (t >>> 8), o[1] = t & 255, o.slice(0, 2);
      if (t <= 918744)
        return t -= 12481, o[0] = 241 + (t >>> 16), o[1] = t >> 8 & 255, o[2] = t & 255, o.slice(0, 3);
      throw new Error("Overflow error");
    }
    /**
     * Write field and value to BinarySerializer
     *
     * @param field field to write to BinarySerializer
     * @param value value to write to BinarySerializer
     */
    writeFieldAndValue(t, o, a = !1) {
      const d = t.associatedType.from(o);
      if (d.toBytesSink === void 0 || t.name === void 0)
        throw new Error();
      this.sink.put(t.header), t.isVariableLengthEncoded ? this.writeLengthEncoded(d, a) : d.toBytesSink(this.sink);
    }
    /**
     * Write a variable length encoded value to the BinarySerializer
     *
     * @param value length encoded value to write to BytesList
     */
    writeLengthEncoded(t, o = !1) {
      const a = new i();
      o || t.toBytesSink(a), this.put(this.encodeVariableLength(a.getLength())), this.writeBytesList(a);
    }
  }
  return Ue.BinarySerializer = n, Ue;
}
var Pn;
function ue() {
  if (Pn) return xe;
  Pn = 1, Object.defineProperty(xe, "__esModule", { value: !0 }), xe.Comparable = xe.SerializedType = void 0;
  const e = Ft(), i = te();
  class n {
    constructor(o) {
      this.bytes = new Uint8Array(0), this.bytes = o ?? new Uint8Array(0);
    }
    static fromParser(o, a) {
      throw new Error("fromParser not implemented");
    }
    static from(o) {
      throw new Error("from not implemented");
    }
    /**
     * Write the bytes representation of a SerializedType to a BytesList
     *
     * @param list The BytesList to write SerializedType bytes to
     */
    toBytesSink(o) {
      o.put(this.bytes);
    }
    /**
     * Get the hex representation of a SerializedType's bytes
     *
     * @returns hex String of this.bytes
     */
    toHex() {
      return (0, i.bytesToHex)(this.toBytes());
    }
    /**
     * Get the bytes representation of a SerializedType
     *
     * @returns A Uint8Array of the bytes
     */
    toBytes() {
      if (this.bytes)
        return this.bytes;
      const o = new e.BytesList();
      return this.toBytesSink(o), o.toBytes();
    }
    /**
     * Return the JSON representation of a SerializedType
     *
     * @param _definitions rippled definitions used to parse the values of transaction types and such.
     *                          Unused in default, but used in STObject, STArray
     *                          Can be customized for sidechains and amendments.
     * @returns any type, if not overloaded returns hexString representation of bytes
     */
    toJSON(o, a) {
      return this.toHex();
    }
    /**
     * @returns hexString representation of this.bytes
     */
    toString() {
      return this.toHex();
    }
  }
  xe.SerializedType = n;
  class r extends n {
    lt(o) {
      return this.compareTo(o) < 0;
    }
    eq(o) {
      return this.compareTo(o) === 0;
    }
    gt(o) {
      return this.compareTo(o) > 0;
    }
    gte(o) {
      return this.compareTo(o) > -1;
    }
    lte(o) {
      return this.compareTo(o) < 1;
    }
    /**
     * Overload this method to define how two Comparable SerializedTypes are compared
     *
     * @param other The comparable object to compare this to
     * @returns A number denoting the relationship of this and other
     */
    compareTo(o) {
      throw new Error(`cannot compare ${this.toString()} and ${o.toString()}`);
    }
  }
  return xe.Comparable = r, xe;
}
var ce = {}, Cn;
function Xi() {
  return Cn || (Cn = 1, Object.defineProperty(ce, "__esModule", { value: !0 }), ce.DELEGATABLE_PERMISSIONS_WIDTH = ce.TRANSACTION_RESULT_WIDTH = ce.TRANSACTION_TYPE_WIDTH = ce.LEDGER_ENTRY_WIDTH = ce.TYPE_WIDTH = void 0, ce.TYPE_WIDTH = 2, ce.LEDGER_ENTRY_WIDTH = 2, ce.TRANSACTION_TYPE_WIDTH = 2, ce.TRANSACTION_RESULT_WIDTH = 1, ce.DELEGATABLE_PERMISSIONS_WIDTH = 4), ce;
}
var Bn;
function lo() {
  if (Bn) return tt;
  Bn = 1, Object.defineProperty(tt, "__esModule", { value: !0 }), tt.FieldLookup = void 0;
  const e = Vi(), i = ue(), n = Xi();
  function r(a, d) {
    const f = [];
    return a < 16 ? d < 16 ? f.push(a << 4 | d) : f.push(a << 4, d) : d < 16 ? f.push(d, a) : f.push(0, a, d), Uint8Array.from(f);
  }
  function t([a, d], f) {
    const m = r(f, d.nth);
    return {
      name: a,
      nth: d.nth,
      isVariableLengthEncoded: d.isVLEncoded,
      isSerialized: d.isSerialized,
      isSigningField: d.isSigningField,
      ordinal: f << 16 | d.nth,
      type: new e.Bytes(d.type, f, n.TYPE_WIDTH),
      header: m,
      associatedType: i.SerializedType
      // For later assignment in ./types/index.js or Definitions.updateAll(...)
    };
  }
  class o {
    constructor(d, f) {
      d.forEach(([m, T]) => {
        const A = f[T.type];
        this[m] = t([m, T], A), this[this[m].ordinal.toString()] = this[m];
      });
    }
    fromString(d) {
      return this[d];
    }
  }
  return tt.FieldLookup = o, tt;
}
var xn;
function $i() {
  return xn || (xn = 1, (function(e) {
    Object.defineProperty(e, "__esModule", { value: !0 }), e.BytesLookup = e.Bytes = e.FieldLookup = e.XrplDefinitionsBase = void 0;
    const i = Vi();
    Object.defineProperty(e, "Bytes", { enumerable: !0, get: function() {
      return i.Bytes;
    } }), Object.defineProperty(e, "BytesLookup", { enumerable: !0, get: function() {
      return i.BytesLookup;
    } });
    const n = lo();
    Object.defineProperty(e, "FieldLookup", { enumerable: !0, get: function() {
      return n.FieldLookup;
    } });
    const r = Xi(), t = ["FeeAmountDelta"];
    class o {
      /**
       * Present rippled types in a typed and updatable format.
       * For an example of the input format see `definitions.json`.
       * To generate a new definitions file from rippled source code, use the tool at
       * `packages/ripple-binary-codec/tools/generateDefinitions.js`.
       *
       * See the definitions.test.js file for examples of how to create your own updated definitions.json.
       *
       * @param enums - A json encoding of the core types, transaction types, transaction results, transaction names, and fields.
       * @param types - A list of type objects with the same name as the fields defined.
       *              You can use the coreTypes object if you are not adding new types.
       */
      constructor(d, f) {
        this.type = new i.BytesLookup(d.TYPES, r.TYPE_WIDTH), this.ledgerEntryType = new i.BytesLookup(d.LEDGER_ENTRY_TYPES, r.LEDGER_ENTRY_WIDTH), this.transactionType = new i.BytesLookup(d.TRANSACTION_TYPES, r.TRANSACTION_TYPE_WIDTH), this.transactionResult = new i.BytesLookup(d.TRANSACTION_RESULTS, r.TRANSACTION_RESULT_WIDTH), this.field = new n.FieldLookup(d.FIELDS, d.TYPES), this.transactionNames = Object.entries(d.TRANSACTION_TYPES).filter(([A, c]) => c >= 0).map(([A, c]) => A), this.dataTypes = {}, this.associateTypes(f), this.granularPermissions = {
          TrustlineAuthorize: 65537,
          TrustlineFreeze: 65538,
          TrustlineUnfreeze: 65539,
          AccountDomainSet: 65540,
          AccountEmailHashSet: 65541,
          AccountMessageKeySet: 65542,
          AccountTransferRateSet: 65543,
          AccountTickSizeSet: 65544,
          PaymentMint: 65545,
          PaymentBurn: 65546,
          MPTokenIssuanceLock: 65547,
          MPTokenIssuanceUnlock: 65548
        };
        const m = Object.fromEntries(Object.entries(d.TRANSACTION_TYPES).map(([A, c]) => [
          A,
          c + 1
        ])), T = Object.assign(Object.assign({}, this.granularPermissions), m);
        this.delegatablePermissions = new i.BytesLookup(T, r.DELEGATABLE_PERMISSIONS_WIDTH);
      }
      /**
       * Associates each Field to a corresponding class that TypeScript can recognize.
       *
       * @param types a list of type objects with the same name as the fields defined.
       *              Defaults to xrpl.js's core type definitions.
       */
      associateTypes(d) {
        this.dataTypes = Object.assign({}, this.dataTypes, d), Object.values(this.field).forEach((f) => {
          f.associatedType = this.dataTypes[f.type.name];
        }), this.field.TransactionType.associatedType = this.transactionType, this.field.TransactionResult.associatedType = this.transactionResult, this.field.LedgerEntryType.associatedType = this.ledgerEntryType, this.field.PermissionValue && (this.field.PermissionValue.associatedType = this.delegatablePermissions), t.forEach((f) => {
          this.field[f] && this.dataTypes.SignedAmount && (this.field[f].associatedType = this.dataTypes.SignedAmount);
        });
      }
      getAssociatedTypes() {
        return this.dataTypes;
      }
    }
    e.XrplDefinitionsBase = o;
  })(en)), en;
}
var Un;
function Ne() {
  return Un || (Un = 1, (function(e) {
    var i = et && et.__importDefault || function(A) {
      return A && A.__esModule ? A : { default: A };
    };
    Object.defineProperty(e, "__esModule", { value: !0 }), e.TRANSACTION_TYPES = e.TransactionType = e.TransactionResult = e.LedgerEntryType = e.Type = e.Field = e.DEFAULT_DEFINITIONS = e.XrplDefinitionsBase = e.Bytes = void 0;
    const n = i(Xr), r = $i();
    Object.defineProperty(e, "XrplDefinitionsBase", { enumerable: !0, get: function() {
      return r.XrplDefinitionsBase;
    } }), Object.defineProperty(e, "Bytes", { enumerable: !0, get: function() {
      return r.Bytes;
    } });
    const t = new r.XrplDefinitionsBase(n.default, {});
    e.DEFAULT_DEFINITIONS = t;
    const o = t.type;
    e.Type = o;
    const a = t.ledgerEntryType;
    e.LedgerEntryType = a;
    const d = t.transactionType;
    e.TransactionType = d;
    const f = t.transactionResult;
    e.TransactionResult = f;
    const m = t.field;
    e.Field = m;
    const T = t.transactionNames;
    e.TRANSACTION_TYPES = T;
  })(et)), et;
}
var tn = {}, nt = {}, nn = {}, W = {};
const J = (e) => Object.freeze(e());
function Gi(e) {
  return e instanceof Uint8Array || ArrayBuffer.isView(e) && e.constructor.name === "Uint8Array" && "BYTES_PER_ELEMENT" in e && e.BYTES_PER_ELEMENT === 1;
}
function ae(e) {
  if (!Gi(e))
    throw new TypeError("Uint8Array expected");
}
function uo(e, i) {
  return Array.isArray(i) ? i.length === 0 ? !0 : i.every((n) => Number.isSafeInteger(n)) : !1;
}
function Ht(e) {
  if (typeof e != "function")
    throw new TypeError("function expected");
  return !0;
}
function le(e, i) {
  if (typeof i != "string")
    throw new TypeError(`${e}: string expected`);
  return !0;
}
function Ot(e, i = "number") {
  if (typeof e != "number")
    throw new TypeError(`${i}: expected number, got ${typeof e}`);
  if (!Number.isSafeInteger(e))
    throw new RangeError(`${i}: expected safe integer, got ${e}`);
}
function Rn(e, i) {
  if (!uo(!1, i))
    throw new TypeError(`${e}: array of numbers expected`);
}
function ye(...e) {
  const i = (o) => o, n = (o, a) => (d) => o(a(d)), r = e.map((o) => o.encode).reduceRight(n, i), t = e.map((o) => o.decode).reduce(n, i);
  return { encode: r, decode: t };
}
function Ki(e) {
  return Ht(e), { encode: (i) => i, decode: (i) => e(i) };
}
const fo = /* @__PURE__ */ (() => {
  let e = [];
  for (let i = 0; i < 40; i++)
    e.push(2 ** i);
  return e;
})();
function Mn(e, i = e.length) {
  const n = new Array(i);
  for (let r = 0; r < i; r++)
    n[r] = e[r];
  return n;
}
const Vn = /* @__PURE__ */ (() => {
  try {
    const e = new TextDecoder();
    return e.decode(Uint8Array.of(65, 48, 43, 127)) === "A0+" ? e : void 0;
  } catch {
    return;
  }
})(), rn = 8192;
function Wi(e) {
  const i = e.length;
  if (Vn !== void 0 && i >= 12)
    return Vn.decode(e);
  if (i <= rn)
    return String.fromCharCode.apply(null, e);
  let n = "";
  for (let r = 0; r < i; r += rn)
    n += String.fromCharCode.apply(null, e.subarray(r, r + rn));
  return n;
}
function de(e) {
  if (Ot(e), e <= 0 || e > 8)
    throw new RangeError("radix2: bits should be in (0..8]");
  const i = fo[e] - 1;
  return {
    encode: (n) => {
      ae(n);
      const r = n.length, t = new Uint8Array(Math.ceil(r * 8 / e));
      let o = 0, a = 0, d = 0;
      for (let f = 0; f < r; )
        for (f + 2 < r ? (o = o << 24 | n[f] << 16 | n[f + 1] << 8 | n[f + 2], a += 24, f += 3) : (o = (o << 8 | n[f]) & 65535, a += 8, f++); a -= e, t[d++] = o >> a & i, !(a < e); )
          ;
      return a > 0 && (t[d] = o << e - a & i), t;
    },
    decode: (n) => {
      const r = n.length, t = new Uint8Array(Math.floor(r * e / 8));
      let o = 0, a = 0, d = 0;
      for (let f = 0; f < r; f++)
        for (o = (o << e | n[f]) & 65535, a += e; a >= 8; a -= 8)
          t[d++] = o >> a - 8 & 255;
      if (o = o << 8 - a & 255, a >= e)
        throw new Error("Excess padding");
      if (o > 0)
        throw new Error(`Non-zero padding: ${o}`);
      return t;
    }
  };
}
function se(e, i) {
  const n = e.length;
  if (n > 128)
    throw new Error("alphabet: max 128 letters");
  const r = new Uint8Array(n), t = new Int8Array(128).fill(-1);
  for (let o = 0; o < n; o++) {
    const a = e.charCodeAt(o);
    if (e.codePointAt(o) !== a || a > 127)
      throw new Error("alphabet: single-char ASCII letters only");
    r[o] = a, t[a] = o;
  }
  if (i !== void 0)
    for (const o of Object.keys(i)) {
      const a = o.charCodeAt(0), d = t[i[o].charCodeAt(0)];
      if (o.length !== 1 || a > 127 || d === void 0 || d === -1)
        throw new Error(`alphabet: invalid alias ${o}`);
      t[a] = d;
    }
  return {
    encode: (o) => {
      const a = new Uint8Array(o.length);
      for (let d = 0; d < o.length; d++) {
        const f = o[d], m = r[f];
        if (m === void 0)
          throw new Error(`alphabet.encode: invalid digit ${f}`);
        a[d] = m;
      }
      return Wi(a);
    },
    decode: (o) => {
      le("decode", o);
      const a = o.length, d = new Uint8Array(a);
      for (let f = 0; f < a; f++) {
        const m = o.charCodeAt(f), T = m < 128 ? t[m] : -1;
        if (T === -1)
          throw new Error(`Unknown letter "${o[f]}". Allowed: ${e}`);
        d[f] = T;
      }
      return d;
    }
  };
}
function kt(e, i = "=") {
  return Ot(e), le("padding", i), {
    encode(n) {
      for (; n.length * e % 8; )
        n += i;
      return n;
    },
    decode(n) {
      le("decode", n);
      let r = n.length;
      if (r * e % 8)
        throw new Error("padding: invalid length");
      for (; r > 0 && n[r - 1] === i; r--)
        if ((r - 1) * e % 8 === 0)
          throw new Error("padding: excess padding");
      return n.slice(0, r);
    }
  };
}
function zn(e) {
  return Ht(e), function(...i) {
    try {
      return e.apply(null, i);
    } catch {
    }
  };
}
function Yi(e, i) {
  if (Ot(e), e <= 0)
    throw new RangeError(`checksum length must be positive: ${e}`);
  Ht(i);
  const n = i;
  return {
    encode(r) {
      ae(r);
      const t = n(r).slice(0, e), o = new Uint8Array(r.length + e);
      return o.set(r), o.set(t, r.length), o;
    },
    decode(r) {
      ae(r);
      const t = r.slice(0, -e), o = r.slice(-e), a = n(t).slice(0, e);
      for (let d = 0; d < e; d++)
        if (a[d] !== o[d])
          throw new Error("Invalid checksum");
      return t;
    }
  };
}
const yo = /* @__PURE__ */ J(() => ye(de(4), se("0123456789ABCDEF"))), ho = /* @__PURE__ */ J(() => ye(de(5), se("ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"), kt(5))), po = /* @__PURE__ */ J(() => ye(de(5), se("ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"))), go = /* @__PURE__ */ J(() => ye(de(5), se("0123456789ABCDEFGHIJKLMNOPQRSTUV"), kt(5))), mo = /* @__PURE__ */ J(() => ye(de(5), se("0123456789ABCDEFGHIJKLMNOPQRSTUV"))), So = /^[\x00-\x7f]*$/, Eo = /* @__PURE__ */ J(() => ye(de(5), se("0123456789ABCDEFGHJKMNPQRSTVWXYZ"), Ki((e) => {
  le("base32crockford.decode", e);
  const i = e.toUpperCase();
  if (e !== i && !So.test(e))
    throw new Error("base32crockford.decode: ASCII expected");
  return i.replace(/O/g, "0").replace(/[IL]/g, "1");
}))), Ji = typeof Uint8Array.from([]).toBase64 == "function" && typeof Uint8Array.fromBase64 == "function", Ao = /[\t\n\f\r ]/, Qi = (e, i) => {
  le("base64", e);
  const n = i ? "base64url" : "base64";
  if (e.length > 0 && Ao.test(e))
    throw new Error("invalid base64");
  return Uint8Array.fromBase64(e, { alphabet: n, lastChunkHandling: "strict" });
}, Zi = /* @__PURE__ */ J(() => ye(de(6), se("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"), kt(6))), er = /* @__PURE__ */ J(() => ye(de(6), se("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"), kt(6))), Io = /* @__PURE__ */ J(() => Ji ? {
  encode(e) {
    return ae(e), e.toBase64();
  },
  decode(e) {
    return Qi(e, !1);
  }
} : Zi), To = /* @__PURE__ */ J(() => ye(de(6), se("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"))), bo = /* @__PURE__ */ J(() => Ji ? {
  encode(e) {
    return ae(e), e.toBase64({ alphabet: "base64url" });
  },
  decode(e) {
    return Qi(e, !0);
  }
} : er), _o = /* @__PURE__ */ J(() => ye(de(6), se("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"))), wo = 656356768, Lo = 60466176, vn = 65536, Do = 2048, Oo = 4096, tr = (e, i) => ({
  encode: (n) => {
    ae(n);
    const r = n.length;
    if (r === 0)
      return new Uint8Array(0);
    if (r >= vn)
      throw new Error("invalid length");
    let t = 0;
    for (; t < r - 1 && n[t] === 0; )
      t++;
    const o = Math.ceil(r / 2), a = new Uint16Array(o), d = r & 1;
    d && (a[0] = n[0]);
    for (let b = d, E = d; b < r; b += 2, E++)
      a[E] = n[b] << 8 | n[b + 1];
    const f = [];
    let m = 0;
    for (; m < o; ) {
      let b = 0;
      for (let E = m; E < o; E++) {
        const l = b * 65536 + a[E], p = Math.floor(l / i);
        b = l - p * i, a[E] = p, p === 0 && E === m && m++;
      }
      f.push(b);
    }
    const T = f.length - 1;
    let A = T * 5;
    for (let b = f[T]; A++, !(b < e); b = Math.floor(b / e))
      ;
    const c = new Uint8Array(t + A);
    let y = c.length - 1;
    for (let b = 0; b < T; b++) {
      let E = f[b];
      for (let l = 0; l < 5; l++)
        c[y--] = E % e, E = Math.floor(E / e);
    }
    for (let b = f[T]; y >= t; b = Math.floor(b / e))
      c[y--] = b % e;
    return c;
  },
  decode: (n) => {
    ae(n);
    const r = n.length;
    if (r === 0)
      return new Uint8Array(0);
    if (r >= vn)
      throw new Error("invalid length");
    let t = 0;
    for (; t < r - 1 && n[t] === 0; )
      t++;
    const o = new Uint16Array(Math.ceil(r * 6 / 16) + 1);
    let a = 0, d = 0, f = r % 5 || 5;
    for (; d < r; ) {
      let c = 0, y = 1;
      for (const E = d + f; d < E; d++) {
        const l = n[d];
        if (l >= e)
          throw new Error(`invalid integer: ${l}`);
        c = c * e + l, y *= e;
      }
      f = 5;
      let b = c;
      for (let E = 0; E < a; E++) {
        const l = o[E] * y + b;
        b = Math.floor(l / 65536), o[E] = l - b * 65536;
      }
      for (; b > 0; b = Math.floor(b / 65536))
        o[a++] = b % 65536;
    }
    const m = a === 0 ? 1 : a * 2 - (o[a - 1] < 256 ? 1 : 0), T = new Uint8Array(t + m);
    let A = T.length - 1;
    for (let c = 0; c < a; c++) {
      const y = o[c];
      T[A--] = y & 255, A >= t && (T[A--] = y >> 8);
    }
    return T;
  }
}), nr = (e, i) => {
  const n = se(i);
  return {
    encode(r) {
      if (ae(r), r.length > Do)
        throw new Error("invalid length");
      return n.encode(e.encode(r));
    },
    decode(r) {
      if (le("baseN.decode", r), r.length > Oo)
        throw new Error("invalid length");
      return e.decode(n.decode(r));
    }
  };
}, ir = /* @__PURE__ */ tr(58, wo), Fo = /* @__PURE__ */ J(() => nr(tr(36, Lo), "0123456789abcdefghijklmnopqrstuvwxyz")), pn = (e) => nr(ir, e), vt = /* @__PURE__ */ J(() => pn("123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz")), No = /* @__PURE__ */ J(() => pn("123456789abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ")), Po = /* @__PURE__ */ J(() => pn("rpshnaf39wBUDNEGHJKLM4PQRST7VWXYZ2bcdeCg65jkm8oFqi1tuvAxyz")), Hn = [0, 2, 3, 5, 6, 7, 9, 10, 11], Co = /* @__PURE__ */ J(() => ({
  encode(e) {
    ae(e);
    let i = "";
    for (let n = 0; n < e.length; n += 8) {
      const r = e.subarray(n, n + 8);
      i += vt.encode(r).padStart(Hn[r.length], "1");
    }
    return i;
  },
  decode(e) {
    le("base58xmr.decode", e);
    const i = e.length, n = i % 11, r = n === 0 ? 0 : Hn.indexOf(n);
    if (r === -1)
      throw new Error(`base58xmr: invalid block length ${n}`);
    const t = new Uint8Array(Math.floor(i / 11) * 8 + r);
    let o = 0;
    for (let a = 0; a < i; a += 11) {
      const d = e.slice(a, a + 11), f = d.length === 11 ? 8 : r, m = vt.decode(d);
      for (let T = 0; T < m.length - f; T++)
        if (m[T] !== 0)
          throw new Error("base58xmr: wrong padding");
      for (let T = m.length - f; T < m.length; T++)
        t[o++] = m[T];
    }
    return t;
  }
})), rr = (e) => {
  Ht(e);
  const i = e;
  return ye(Yi(4, (n) => i(i(n))), vt);
}, Bo = rr, ln = /* @__PURE__ */ se("qpzry9x8gf2tvdw0s3jn54khce6mua7l"), xo = /^[\x21-\x60\x7b-\x7e]+$/;
function kn(e, i) {
  for (let n = 0; n < i.length; n++) {
    const r = i.charCodeAt(n);
    if (r < 33 || r > 126)
      throw new Error(`${e}: printable ASCII expected`);
  }
}
function Uo(e) {
  const i = e.length, n = new Uint8Array(i);
  for (let r = 0; r < i; r++) {
    const t = e[r];
    if (t < 0 || t >= 32)
      throw new Error(`alphabet.encode: invalid digit ${t}`);
    n[r] = t;
  }
  return n;
}
const jn = [996825010, 642813549, 513874426, 1027748829, 705979059];
function it(e) {
  const i = e >> 25;
  let n = (e & 33554431) << 5;
  for (let r = 0; r < jn.length; r++)
    (i >> r & 1) === 1 && (n ^= jn[r]);
  return n;
}
function qn(e, i, n = 1) {
  const r = e.length;
  let t = 1;
  for (let a = 0; a < r; a++) {
    const d = e.charCodeAt(a);
    if (d < 33 || d > 126)
      throw new Error(`Invalid prefix (${e})`);
    t = it(t) ^ d >> 5;
  }
  t = it(t);
  for (let a = 0; a < r; a++)
    t = it(t) ^ e.charCodeAt(a) & 31;
  for (let a of i)
    t = it(t) ^ a;
  for (let a = 0; a < 6; a++)
    t = it(t);
  t ^= n;
  const o = new Uint8Array(6);
  for (let a = 0; a < 6; a++)
    o[a] = t >>> 5 * (5 - a) & 31;
  return ln.encode(o);
}
function or(e) {
  const i = e === "bech32" ? 1 : 734539939, n = de(5), r = (A) => {
    ae(A);
    const c = A.length, y = new Array(Math.ceil(c * 8 / 5));
    let b = 0, E = 0, l = 0;
    for (let p = 0; p < c; p++)
      for (b = b << 8 | A[p], E += 8; E >= 5; E -= 5)
        y[l++] = b >> E - 5 & 31;
    return E > 0 && (y[l] = b << 5 - E & 31), y;
  }, t = (A) => {
    Rn("radix2.decode", A);
    const c = A.length, y = new Uint8Array(c);
    for (let b = 0; b < c; b++) {
      const E = A[b];
      if (E < 0 || E >= 32)
        throw new Error(`convertRadix2: invalid word=${E}`);
      y[b] = E;
    }
    return n.decode(y);
  }, o = zn(t);
  function a(A, c, y = 90) {
    le("bech32.encode prefix", A), y !== !1 && Ot(y, "limit"), Gi(c) && (c = Mn(c)), Rn("bech32.encode", c);
    const b = A.length;
    if (b === 0)
      throw new TypeError(`Invalid prefix length ${b}`);
    const E = b + 7 + c.length;
    if (y !== !1 && E > y)
      throw new TypeError(`Length ${E} exceeds limit ${y}`);
    kn("bech32.encode prefix", A);
    const l = A.toLowerCase(), p = qn(l, c, i);
    return `${l}1${ln.encode(Uo(c))}${p}`;
  }
  function d(A, c = 90) {
    le("bech32.decode input", A), c !== !1 && Ot(c, "limit");
    const y = A.length;
    if (y < 8 || c !== !1 && y > c)
      throw new TypeError(`invalid string length ${y}, expected (8..${c})`);
    const b = A.toLowerCase();
    if (A !== b && !xo.test(A))
      throw kn("bech32.decode input", A), new Error("mixed-case string not allowed");
    const E = b.lastIndexOf("1");
    if (E === 0 || E === -1)
      throw new Error('invalid separator "1"');
    const l = b.slice(0, E), p = b.slice(E + 1);
    if (p.length < 6)
      throw new Error("invalid data length");
    const D = ln.decode(p), P = Mn(D, D.length - 6), I = qn(l, P, i);
    if (!p.endsWith(I))
      throw new Error(`Invalid checksum in ${A}`);
    return { prefix: l, words: P };
  }
  const f = zn(d);
  function m(A, c = 90) {
    const { prefix: y, words: b } = d(A, c);
    return {
      prefix: y,
      words: b,
      bytes: t(b)
    };
  }
  function T(A, c) {
    return a(A, r(c));
  }
  return {
    encode: a,
    decode: d,
    encodeFromBytes: T,
    decodeToBytes: m,
    decodeUnsafe: f,
    fromWords: t,
    fromWordsUnsafe: o,
    toWords: r
  };
}
const Ro = /* @__PURE__ */ J(() => or("bech32")), Mo = /* @__PURE__ */ J(() => or("bech32m")), Vo = /* @__PURE__ */ J(() => ({
  encode(e) {
    ae(e);
    for (let i = 0; i < e.length; i++) {
      const n = e[i];
      if (n > 127)
        throw new RangeError(`non-ASCII byte ${n} at ${i}`);
    }
    return Wi(e);
  },
  decode(e) {
    if (typeof e != "string")
      throw new TypeError("ascii string expected, got " + typeof e);
    const i = new Uint8Array(e.length);
    for (let n = 0; n < e.length; n++) {
      const r = e.charCodeAt(n);
      if (r > 127)
        throw new RangeError(`non-ASCII char "${e[n]}" (${r}) at ${n}`);
      i[n] = r;
    }
    return i;
  }
})), ar = (e) => {
  try {
    return encodeURI(e) !== null;
  } catch {
    return !1;
  }
}, sr = /* Pick the native check once so utf8.decode doesn't re-probe String.prototype on every call. */ typeof "".isWellFormed == "function" ? (e) => e.isWellFormed() : ar, Ke = (e) => new TypeError(`invalid utf8 at byte ${e}`), un = /* @__PURE__ */ J(() => ({
  encode(e) {
    ae(e);
    let i = "";
    for (let n = 0; n < e.length; ) {
      const r = e[n++];
      if (r < 128) {
        i += String.fromCharCode(r);
        continue;
      }
      if (r < 194 || n >= e.length)
        throw Ke(n - 1);
      const t = e[n++];
      if ((t & 192) !== 128)
        throw Ke(n - 1);
      let o = (r & 31) << 6 | t & 63;
      if (r >= 224) {
        if (n >= e.length)
          throw Ke(n - 1);
        const a = e[n++];
        if ((a & 192) !== 128 || r === 224 && t < 160 || r === 237 && t >= 160)
          throw Ke(n - 1);
        if (o = (r & 15) << 12 | (t & 63) << 6 | a & 63, r >= 240) {
          if (n >= e.length)
            throw Ke(n - 1);
          const d = e[n++];
          if (r > 244 || (d & 192) !== 128 || r === 240 && t < 144 || r === 244 && t >= 144)
            throw Ke(n - 1);
          o = (r & 7) << 18 | (t & 63) << 12 | (a & 63) << 6 | d & 63;
        }
      }
      o < 65536 ? i += String.fromCharCode(o) : (o -= 65536, i += String.fromCharCode((o >> 10) + 55296, (o & 1023) + 56320));
    }
    return i;
  },
  decode(e) {
    if (le("utf8", e), !sr(e))
      throw new TypeError("utf8 expected well-formed string");
    const i = new Uint8Array(e.length * 3);
    let n = 0;
    for (let r = 0; r < e.length; r++) {
      let t = e.charCodeAt(r);
      if (t < 128) {
        i[n++] = t;
        continue;
      }
      if (t >= 55296 && t <= 57343) {
        const o = e.charCodeAt(++r);
        t = 65536 + (t - 55296 << 10) + o - 56320;
      }
      t >= 65536 ? (i[n++] = t >> 18 | 240, i[n++] = t >> 12 & 63 | 128) : t >= 2048 ? i[n++] = t >> 12 | 224 : i[n++] = t >> 6 | 192, t >= 2048 && (i[n++] = t >> 6 & 63 | 128), i[n++] = t & 63 | 128;
    }
    return i.subarray(0, n);
  }
})), zo = /* @__PURE__ */ J(() => {
  let e, i;
  const n = {
    // ignoreBOM preserves an explicit leading U+FEFF;
    // fatal rejects invalid UTF-8 bytes instead of replacing them.
    encode(r) {
      return ae(r), (i || (i = new TextDecoder("utf-8", { ignoreBOM: !0, fatal: !0 }))).decode(r);
    },
    decode(r) {
      if (le("utf8", r), !sr(r))
        throw new TypeError("utf8 expected well-formed string");
      return (e || (e = new TextEncoder())).encode(r);
    }
  };
  return {
    // Select each direction once at module init, since
    // TextEncoder and TextDecoder can exist independently.
    encode: typeof TextDecoder == "function" ? n.encode : un.encode,
    decode: typeof TextEncoder == "function" ? n.decode : un.decode
  };
}), cr = /* @__PURE__ */ J(() => ye(
  de(4),
  // Case-insensitive decode via table aliases instead of a toLowerCase pass.
  se("0123456789abcdef", { A: "a", B: "b", C: "c", D: "d", E: "e", F: "f" }),
  Ki((e) => {
    if (le("hex", e), e.length % 2 !== 0)
      throw new TypeError(`hex.decode: odd-length string (${e.length})`);
    return e;
  })
)), vo = /* @__PURE__ */ J(() => ({
  alphabet: se,
  base64Fallback: Zi,
  base64urlFallback: er,
  hexFallback: cr,
  radix2: de,
  radix58: ir,
  checksum: Yi,
  utf8Fallback: un,
  _isWellFormedShim: ar
})), Ho = /* Require both directions before enabling the native hex path so encode/decode stay symmetric. */ typeof Uint8Array.from([]).toHex == "function" && typeof Uint8Array.fromHex == "function", ko = {
  // Keep local type guards so the native path preserves library-level input errors.
  // Native toHex emits lowercase hex, matching the fallback alphabet and Node's hex strings.
  encode(e) {
    return ae(e), e.toHex();
  },
  // Native fromHex accepts either hex case and rejects odd-length / non-hex syntax.
  decode(e) {
    return le("hex", e), Uint8Array.fromHex(e);
  }
}, jo = /* @__PURE__ */ J(() => Ho ? ko : cr), qo = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  __TESTS: vo,
  ascii: Vo,
  base16: yo,
  base32: ho,
  base32crockford: Eo,
  base32hex: go,
  base32hexnopad: mo,
  base32nopad: po,
  base36: Fo,
  base58: vt,
  base58check: Bo,
  base58flickr: No,
  base58xmr: Co,
  base58xrp: Po,
  base64: Io,
  base64nopad: To,
  base64url: bo,
  base64urlnopad: _o,
  bech32: Ro,
  bech32m: Mo,
  createBase58check: rr,
  hex: jo,
  utf8: zo
}, Symbol.toStringTag, { value: "Module" })), Xo = /* @__PURE__ */ dn(qo);
var Me = {};
const Bt = BigInt(2 ** 32 - 1), Xn = /* @__PURE__ */ BigInt(32);
function $o(e, i = !1) {
  return i ? { h: Number(e & Bt), l: Number(e >> Xn & Bt) } : { h: Number(e >> Xn & Bt) | 0, l: Number(e & Bt) | 0 };
}
function Go(e, i = !1) {
  const n = e.length;
  let r = new Uint32Array(n), t = new Uint32Array(n);
  for (let o = 0; o < n; o++) {
    const { h: a, l: d } = $o(e[o], i);
    [r[o], t[o]] = [a, d];
  }
  return [r, t];
}
const Ko = (e) => e / 2 ** 32 | 0, Wo = (e) => e >>> 0;
function Yo(e, i, n, r) {
  const t = Ko(n), o = Wo(n);
  e.setUint32(i, r ? o : t, r), e.setUint32(i + 4, r ? t : o, r);
}
const $n = (e, i, n) => e >>> n, Gn = (e, i, n) => e << 32 - n | i >>> n, We = (e, i, n) => e >>> n | i << 32 - n, Ye = (e, i, n) => e << 32 - n | i >>> n, xt = (e, i, n) => e << 64 - n | i >>> n - 32, Ut = (e, i, n) => e >>> n - 32 | i << 64 - n;
function _e(e, i, n, r) {
  const t = (i >>> 0) + (r >>> 0);
  return { h: e + n + (t / 2 ** 32 | 0) | 0, l: t | 0 };
}
const Jo = (e, i, n) => (e >>> 0) + (i >>> 0) + (n >>> 0), Qo = (e, i, n, r) => i + n + r + (e / 2 ** 32 | 0) | 0, Zo = (e, i, n, r) => (e >>> 0) + (i >>> 0) + (n >>> 0) + (r >>> 0), ea = (e, i, n, r, t) => i + n + r + t + (e / 2 ** 32 | 0) | 0, ta = (e, i, n, r, t) => (e >>> 0) + (i >>> 0) + (n >>> 0) + (r >>> 0) + (t >>> 0), na = (e, i, n, r, t, o) => i + n + r + t + o + (e / 2 ** 32 | 0) | 0;
function ia(e, i, n) {
  return e & i ^ ~e & n;
}
function ra(e, i, n) {
  return e & i ^ e & n ^ i & n;
}
class lr {
  constructor(i, n, r, t) {
    j(this, "blockLen");
    j(this, "outputLen");
    j(this, "canXOF", !1);
    j(this, "padOffset");
    j(this, "isLE");
    // For partial updates less than block size
    j(this, "buffer");
    j(this, "view");
    j(this, "finished", !1);
    j(this, "length", 0);
    j(this, "pos", 0);
    j(this, "destroyed", !1);
    this.blockLen = i, this.outputLen = n, this.padOffset = r, this.isLE = t, this.buffer = new Uint8Array(i), this.view = Vt(this.buffer);
  }
  update(i) {
    cn(this), qe(i);
    const { view: n, buffer: r, blockLen: t } = this, o = i.length;
    let a = !1;
    for (let d = 0; d < o; ) {
      const f = Math.min(t - this.pos, o - d);
      if (f === t) {
        const m = Vt(i);
        for (; t <= o - d; d += t)
          this.process(m, d);
        a = !0;
        continue;
      }
      r.set(d === 0 && f === o ? i : i.subarray(d, d + f), this.pos), this.pos += f, d += f, this.pos === t && (this.process(n, 0), this.pos = 0, a = !0);
    }
    return this.length += i.length, a && this.roundClean(), this;
  }
  digestInto(i) {
    cn(this), zi(i, this), this.finished = !0;
    const { buffer: n, view: r, blockLen: t, isLE: o } = this;
    let { pos: a } = this;
    n[a++] = 128, n.fill(0, a), this.padOffset > t - a && (this.process(r, 0), n.fill(0)), Yo(r, t - 8, this.length * 8, o), this.process(r, 0), this.roundClean();
    const d = i === n ? r : Vt(i), f = this.outputLen, m = f / 4, T = this.get();
    if (f % 4 || m > T.length)
      throw new Error("invalid outputLen");
    for (let A = 0; A < m; A++)
      d.setUint32(4 * A, T[A], o);
  }
  digest() {
    const { buffer: i, outputLen: n } = this;
    this.digestInto(i);
    const r = i.slice(0, n);
    return this.destroy(), r;
  }
  _cloneIntoMeta(i) {
    const { buffer: n, length: r, finished: t, destroyed: o, pos: a } = this;
    return i.destroyed = o, i.finished = t, i.length = r, i.pos = a, a && i.buffer.set(n), i;
  }
  clone() {
    return this._cloneInto();
  }
}
const oa = /* @__PURE__ */ Uint32Array.from([
  1779033703,
  3144134277,
  1013904242,
  2773480762,
  1359893119,
  2600822924,
  528734635,
  1541459225
]), aa = /* @__PURE__ */ Uint32Array.from([
  3238371032,
  914150663,
  812702999,
  4144912697,
  4290775857,
  1750603025,
  1694076839,
  3204075428
]), sa = /* @__PURE__ */ Uint32Array.from([
  3418070365,
  3238371032,
  1654270250,
  914150663,
  2438529370,
  812702999,
  355462360,
  4144912697,
  1731405415,
  4290775857,
  2394180231,
  1750603025,
  3675008525,
  1694076839,
  1203062813,
  3204075428
]), ca = /* @__PURE__ */ Uint32Array.from([
  1779033703,
  4089235720,
  3144134277,
  2227873595,
  1013904242,
  4271175723,
  2773480762,
  1595750129,
  1359893119,
  2917565137,
  2600822924,
  725511199,
  528734635,
  4215389547,
  1541459225,
  327033209
]), la = /* @__PURE__ */ Uint32Array.from([
  1116352408,
  1899447441,
  3049323471,
  3921009573,
  961987163,
  1508970993,
  2453635748,
  2870763221,
  3624381080,
  310598401,
  607225278,
  1426881987,
  1925078388,
  2162078206,
  2614888103,
  3248222580,
  3835390401,
  4022224774,
  264347078,
  604807628,
  770255983,
  1249150122,
  1555081692,
  1996064986,
  2554220882,
  2821834349,
  2952996808,
  3210313671,
  3336571891,
  3584528711,
  113926993,
  338241895,
  666307205,
  773529912,
  1294757372,
  1396182291,
  1695183700,
  1986661051,
  2177026350,
  2456956037,
  2730485921,
  2820302411,
  3259730800,
  3345764771,
  3516065817,
  3600352804,
  4094571909,
  275423344,
  430227734,
  506948616,
  659060556,
  883997877,
  958139571,
  1322822218,
  1537002063,
  1747873779,
  1955562222,
  2024104815,
  2227730452,
  2361852424,
  2428436474,
  2756734187,
  3204031479,
  3329325298
]), De = /* @__PURE__ */ new Uint32Array(64);
class ur extends lr {
  constructor(n, r) {
    super(64, n, 8, !1);
    // We cannot use array here since array allows indexing by variable
    // which means optimizer/compiler cannot use registers.
    // Numeric initializers matter: starting the fields as `undefined` changes
    // V8's field representation and makes sha256 3x slower (measured).
    j(this, "A", 0);
    j(this, "B", 0);
    j(this, "C", 0);
    j(this, "D", 0);
    j(this, "E", 0);
    j(this, "F", 0);
    j(this, "G", 0);
    j(this, "H", 0);
    this.A = r[0] | 0, this.B = r[1] | 0, this.C = r[2] | 0, this.D = r[3] | 0, this.E = r[4] | 0, this.F = r[5] | 0, this.G = r[6] | 0, this.H = r[7] | 0;
  }
  get() {
    const { A: n, B: r, C: t, D: o, E: a, F: d, G: f, H: m } = this;
    return [n, r, t, o, a, d, f, m];
  }
  // prettier-ignore
  set(n, r, t, o, a, d, f, m) {
    this.A = n | 0, this.B = r | 0, this.C = t | 0, this.D = o | 0, this.E = a | 0, this.F = d | 0, this.G = f | 0, this.H = m | 0;
  }
  _cloneInto(n) {
    return (n || (n = new this.constructor())).set(...this.get()), this._cloneIntoMeta(n);
  }
  process(n, r) {
    for (let c = 0; c < 16; c++, r += 4)
      De[c] = n.getUint32(r, !1);
    for (let c = 16; c < 64; c++) {
      const y = De[c - 15], b = De[c - 2], E = me(y, 7) ^ me(y, 18) ^ y >>> 3, l = me(b, 17) ^ me(b, 19) ^ b >>> 10;
      De[c] = l + De[c - 7] + E + De[c - 16] | 0;
    }
    let { A: t, B: o, C: a, D: d, E: f, F: m, G: T, H: A } = this;
    for (let c = 0; c < 64; c++) {
      const y = me(f, 6) ^ me(f, 11) ^ me(f, 25), b = A + y + ia(f, m, T) + la[c] + De[c] | 0, l = (me(t, 2) ^ me(t, 13) ^ me(t, 22)) + ra(t, o, a) | 0;
      A = T, T = m, m = f, f = d + b | 0, d = a, a = o, o = t, t = b + l | 0;
    }
    t = t + this.A | 0, o = o + this.B | 0, a = a + this.C | 0, d = d + this.D | 0, f = f + this.E | 0, m = m + this.F | 0, T = T + this.G | 0, A = A + this.H | 0, this.set(t, o, a, d, f, m, T, A);
  }
  roundClean() {
    Qe(De);
  }
  destroy() {
    this.destroyed = !0, this.set(0, 0, 0, 0, 0, 0, 0, 0), Qe(this.buffer);
  }
}
class dr extends ur {
  constructor() {
    super(32, oa);
  }
}
class fr extends ur {
  constructor() {
    super(28, aa);
  }
}
const yr = Go([
  "0x428a2f98d728ae22",
  "0x7137449123ef65cd",
  "0xb5c0fbcfec4d3b2f",
  "0xe9b5dba58189dbbc",
  "0x3956c25bf348b538",
  "0x59f111f1b605d019",
  "0x923f82a4af194f9b",
  "0xab1c5ed5da6d8118",
  "0xd807aa98a3030242",
  "0x12835b0145706fbe",
  "0x243185be4ee4b28c",
  "0x550c7dc3d5ffb4e2",
  "0x72be5d74f27b896f",
  "0x80deb1fe3b1696b1",
  "0x9bdc06a725c71235",
  "0xc19bf174cf692694",
  "0xe49b69c19ef14ad2",
  "0xefbe4786384f25e3",
  "0x0fc19dc68b8cd5b5",
  "0x240ca1cc77ac9c65",
  "0x2de92c6f592b0275",
  "0x4a7484aa6ea6e483",
  "0x5cb0a9dcbd41fbd4",
  "0x76f988da831153b5",
  "0x983e5152ee66dfab",
  "0xa831c66d2db43210",
  "0xb00327c898fb213f",
  "0xbf597fc7beef0ee4",
  "0xc6e00bf33da88fc2",
  "0xd5a79147930aa725",
  "0x06ca6351e003826f",
  "0x142929670a0e6e70",
  "0x27b70a8546d22ffc",
  "0x2e1b21385c26c926",
  "0x4d2c6dfc5ac42aed",
  "0x53380d139d95b3df",
  "0x650a73548baf63de",
  "0x766a0abb3c77b2a8",
  "0x81c2c92e47edaee6",
  "0x92722c851482353b",
  "0xa2bfe8a14cf10364",
  "0xa81a664bbc423001",
  "0xc24b8b70d0f89791",
  "0xc76c51a30654be30",
  "0xd192e819d6ef5218",
  "0xd69906245565a910",
  "0xf40e35855771202a",
  "0x106aa07032bbd1b8",
  "0x19a4c116b8d2d0c8",
  "0x1e376c085141ab53",
  "0x2748774cdf8eeb99",
  "0x34b0bcb5e19b48a8",
  "0x391c0cb3c5c95a63",
  "0x4ed8aa4ae3418acb",
  "0x5b9cca4f7763e373",
  "0x682e6ff3d6b2b8a3",
  "0x748f82ee5defb2fc",
  "0x78a5636f43172f60",
  "0x84c87814a1f0ab72",
  "0x8cc702081a6439ec",
  "0x90befffa23631e28",
  "0xa4506cebde82bde9",
  "0xbef9a3f7b2c67915",
  "0xc67178f2e372532b",
  "0xca273eceea26619c",
  "0xd186b8c721c0c207",
  "0xeada7dd6cde0eb1e",
  "0xf57d4f7fee6ed178",
  "0x06f067aa72176fba",
  "0x0a637dc5a2c898a6",
  "0x113f9804bef90dae",
  "0x1b710b35131c471b",
  "0x28db77f523047d84",
  "0x32caab7b40c72493",
  "0x3c9ebe0a15c9bebc",
  "0x431d67c49c100d4c",
  "0x4cc5d4becb3e42b6",
  "0x597f299cfc657e2a",
  "0x5fcb6fab3ad6faec",
  "0x6c44198c4a475817"
].map((e) => BigInt(e))), ua = yr[0], da = yr[1], Oe = /* @__PURE__ */ new Uint32Array(80), Fe = /* @__PURE__ */ new Uint32Array(80);
class jt extends lr {
  constructor(n, r) {
    super(128, n, 16, !1);
    // We cannot use array here since array allows indexing by variable
    // which means optimizer/compiler cannot use registers.
    // h -- high 32 bits, l -- low 32 bits
    // Numeric initializers matter: starting the fields as `undefined` changes
    // V8's field representation and slows hashing down (measured on sha256).
    j(this, "Ah", 0);
    j(this, "Al", 0);
    j(this, "Bh", 0);
    j(this, "Bl", 0);
    j(this, "Ch", 0);
    j(this, "Cl", 0);
    j(this, "Dh", 0);
    j(this, "Dl", 0);
    j(this, "Eh", 0);
    j(this, "El", 0);
    j(this, "Fh", 0);
    j(this, "Fl", 0);
    j(this, "Gh", 0);
    j(this, "Gl", 0);
    j(this, "Hh", 0);
    j(this, "Hl", 0);
    this.Ah = r[0] | 0, this.Al = r[1] | 0, this.Bh = r[2] | 0, this.Bl = r[3] | 0, this.Ch = r[4] | 0, this.Cl = r[5] | 0, this.Dh = r[6] | 0, this.Dl = r[7] | 0, this.Eh = r[8] | 0, this.El = r[9] | 0, this.Fh = r[10] | 0, this.Fl = r[11] | 0, this.Gh = r[12] | 0, this.Gl = r[13] | 0, this.Hh = r[14] | 0, this.Hl = r[15] | 0;
  }
  // prettier-ignore
  get() {
    const { Ah: n, Al: r, Bh: t, Bl: o, Ch: a, Cl: d, Dh: f, Dl: m, Eh: T, El: A, Fh: c, Fl: y, Gh: b, Gl: E, Hh: l, Hl: p } = this;
    return [n, r, t, o, a, d, f, m, T, A, c, y, b, E, l, p];
  }
  // prettier-ignore
  set(n, r, t, o, a, d, f, m, T, A, c, y, b, E, l, p) {
    this.Ah = n | 0, this.Al = r | 0, this.Bh = t | 0, this.Bl = o | 0, this.Ch = a | 0, this.Cl = d | 0, this.Dh = f | 0, this.Dl = m | 0, this.Eh = T | 0, this.El = A | 0, this.Fh = c | 0, this.Fl = y | 0, this.Gh = b | 0, this.Gl = E | 0, this.Hh = l | 0, this.Hl = p | 0;
  }
  _cloneInto(n) {
    return (n || (n = new this.constructor())).set(...this.get()), this._cloneIntoMeta(n);
  }
  process(n, r) {
    for (let I = 0; I < 16; I++, r += 4)
      Oe[I] = n.getUint32(r), Fe[I] = n.getUint32(r += 4);
    for (let I = 16; I < 80; I++) {
      const F = Oe[I - 15] | 0, C = Fe[I - 15] | 0, B = We(F, C, 1) ^ We(F, C, 8) ^ $n(F, C, 7), z = Ye(F, C, 1) ^ Ye(F, C, 8) ^ Gn(F, C, 7), R = Oe[I - 2] | 0, v = Fe[I - 2] | 0, V = We(R, v, 19) ^ xt(R, v, 61) ^ $n(R, v, 6), q = Ye(R, v, 19) ^ Ut(R, v, 61) ^ Gn(R, v, 6), G = Zo(z, q, Fe[I - 7], Fe[I - 16]), Q = ea(G, B, V, Oe[I - 7], Oe[I - 16]);
      Oe[I] = Q | 0, Fe[I] = G | 0;
    }
    let { Ah: t, Al: o, Bh: a, Bl: d, Ch: f, Cl: m, Dh: T, Dl: A, Eh: c, El: y, Fh: b, Fl: E, Gh: l, Gl: p, Hh: D, Hl: P } = this;
    for (let I = 0; I < 80; I++) {
      const F = We(c, y, 14) ^ We(c, y, 18) ^ xt(c, y, 41), C = Ye(c, y, 14) ^ Ye(c, y, 18) ^ Ut(c, y, 41), B = c & b ^ ~c & l, z = y & E ^ ~y & p, R = ta(P, C, z, da[I], Fe[I]), v = na(R, D, F, B, ua[I], Oe[I]), V = R | 0, q = We(t, o, 28) ^ xt(t, o, 34) ^ xt(t, o, 39), G = Ye(t, o, 28) ^ Ut(t, o, 34) ^ Ut(t, o, 39), Q = t & a ^ t & f ^ a & f, he = o & d ^ o & m ^ d & m;
      D = l | 0, P = p | 0, l = b | 0, p = E | 0, b = c | 0, E = y | 0, { h: c, l: y } = _e(T | 0, A | 0, v | 0, V | 0), T = f | 0, A = m | 0, f = a | 0, m = d | 0, a = t | 0, d = o | 0;
      const re = Jo(V, G, he);
      t = Qo(re, v, q, Q), o = re | 0;
    }
    ({ h: t, l: o } = _e(this.Ah | 0, this.Al | 0, t | 0, o | 0)), { h: a, l: d } = _e(this.Bh | 0, this.Bl | 0, a | 0, d | 0), { h: f, l: m } = _e(this.Ch | 0, this.Cl | 0, f | 0, m | 0), { h: T, l: A } = _e(this.Dh | 0, this.Dl | 0, T | 0, A | 0), { h: c, l: y } = _e(this.Eh | 0, this.El | 0, c | 0, y | 0), { h: b, l: E } = _e(this.Fh | 0, this.Fl | 0, b | 0, E | 0), { h: l, l: p } = _e(this.Gh | 0, this.Gl | 0, l | 0, p | 0), { h: D, l: P } = _e(this.Hh | 0, this.Hl | 0, D | 0, P | 0), this.set(t, o, a, d, f, m, T, A, c, y, b, E, l, p, D, P);
  }
  roundClean() {
    Qe(Oe, Fe);
  }
  destroy() {
    this.destroyed = !0, Qe(this.buffer), this.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
  }
}
class hr extends jt {
  constructor() {
    super(64, ca);
  }
}
class pr extends jt {
  constructor() {
    super(48, sa);
  }
}
const fa = /* @__PURE__ */ Uint32Array.from([
  2352822216,
  424955298,
  1944164710,
  2312950998,
  502970286,
  855612546,
  1738396948,
  1479516111,
  258812777,
  2077511080,
  2011393907,
  79989058,
  1067287976,
  1780299464,
  286451373,
  2446758561
]), ya = /* @__PURE__ */ Uint32Array.from([
  573645204,
  4230739756,
  2673172387,
  3360449730,
  596883563,
  1867755857,
  2520282905,
  1497426621,
  2519219938,
  2827943907,
  3193839141,
  1401305490,
  721525244,
  746961066,
  246885852,
  2177182882
]);
class gr extends jt {
  constructor() {
    super(28, fa);
  }
}
class mr extends jt {
  constructor() {
    super(32, ya);
  }
}
const ha = /* @__PURE__ */ Xe(
  () => new dr(),
  /* @__PURE__ */ $e(1)
), pa = /* @__PURE__ */ Xe(
  () => new fr(),
  /* @__PURE__ */ $e(4)
), ga = /* @__PURE__ */ Xe(
  () => new hr(),
  /* @__PURE__ */ $e(3)
), ma = /* @__PURE__ */ Xe(
  () => new pr(),
  /* @__PURE__ */ $e(2)
), Sa = /* @__PURE__ */ Xe(
  () => new mr(),
  /* @__PURE__ */ $e(6)
), Ea = /* @__PURE__ */ Xe(
  () => new gr(),
  /* @__PURE__ */ $e(5)
), Aa = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  _SHA224: fr,
  _SHA256: dr,
  _SHA384: pr,
  _SHA512: hr,
  _SHA512_224: gr,
  _SHA512_256: mr,
  sha224: pa,
  sha256: ha,
  sha384: ma,
  sha512: ga,
  sha512_224: Ea,
  sha512_256: Sa
}, Symbol.toStringTag, { value: "Module" })), Sr = /* @__PURE__ */ dn(Aa);
var Je = {}, Rt = {}, Kn;
function Ia() {
  if (Kn) return Rt;
  Kn = 1, Object.defineProperty(Rt, "__esModule", { value: !0 });
  const e = hn;
  function i(n) {
    return Array.isArray(n) ? new Uint8Array(n) : typeof n == "string" ? (0, e.utf8ToBytes)(n) : n;
  }
  return Rt.default = i, Rt;
}
var Wn;
function Er() {
  if (Wn) return Je;
  Wn = 1;
  var e = Je && Je.__importDefault || function(r) {
    return r && r.__esModule ? r : { default: r };
  };
  Object.defineProperty(Je, "__esModule", { value: !0 });
  const i = e(Ia());
  function n(r) {
    function t(o) {
      return r((0, i.default)(o));
    }
    return t.create = () => {
      const o = r.create();
      return {
        update(a) {
          return o.update((0, i.default)(a)), this;
        },
        digest() {
          return o.digest();
        }
      };
    }, t;
  }
  return Je.default = n, Je;
}
var Yn;
function Ta() {
  if (Yn) return Me;
  Yn = 1;
  var e = Me && Me.__importDefault || function(r) {
    return r && r.__esModule ? r : { default: r };
  };
  Object.defineProperty(Me, "__esModule", { value: !0 }), Me.sha256 = void 0;
  const i = Sr, n = e(Er());
  return Me.sha256 = (0, n.default)(i.sha256), Me;
}
var Ve = {}, Jn;
function ba() {
  if (Jn) return Ve;
  Jn = 1, Object.defineProperty(Ve, "__esModule", { value: !0 }), Ve.concatArgs = Ve.arrayEqual = void 0;
  function e(r, t) {
    if (r.length !== t.length)
      return !1;
    let o = 0;
    for (let a = 0; a < r.length; a++)
      o |= r[a] ^ t[a];
    return o === 0;
  }
  Ve.arrayEqual = e;
  function i(r) {
    return typeof r == "number";
  }
  function n(...r) {
    return r.flatMap((t) => i(t) ? [t] : Array.from(t));
  }
  return Ve.concatArgs = n, Ve;
}
var Qn;
function _a() {
  if (Qn) return W;
  Qn = 1, Object.defineProperty(W, "__esModule", { value: !0 }), W.isValidClassicAddress = W.decodeAccountPublic = W.encodeAccountPublic = W.encodeNodePublic = W.decodeNodePublic = W.decodeAddress = W.decodeAccountID = W.encodeAddress = W.encodeAccountID = W.decodeSeed = W.encodeSeed = W.codec = void 0;
  const e = Xo, i = Ta(), n = ba();
  class r {
    constructor(C) {
      this._sha256 = C.sha256, this._codec = e.base58xrp;
    }
    /**
     * Encoder.
     *
     * @param bytes - Uint8Array of data to encode.
     * @param opts - Options object including the version bytes and the expected length of the data to encode.
     */
    encode(C, B) {
      const z = B.versions;
      return this._encodeVersioned(C, z, B.expectedLength);
    }
    /**
     * Decoder.
     *
     * @param base58string - Base58Check-encoded string to decode.
     * @param opts - Options object including the version byte(s) and the expected length of the data after decoding.
     */
    /* eslint-disable max-lines-per-function --
     * TODO refactor */
    decode(C, B) {
      var z;
      const R = B.versions, v = B.versionTypes, V = this.decodeChecked(C);
      if (R.length > 1 && !B.expectedLength)
        throw new Error("expectedLength is required because there are >= 2 possible versions");
      const q = typeof R[0] == "number" ? 1 : R[0].length, G = (z = B.expectedLength) !== null && z !== void 0 ? z : V.length - q, Q = V.slice(0, -G), he = V.slice(-G);
      for (let re = 0; re < R.length; re++) {
        const pe = Array.isArray(R[re]) ? R[re] : [R[re]];
        if ((0, n.arrayEqual)(Q, pe))
          return {
            version: pe,
            bytes: he,
            type: v ? v[re] : null
          };
      }
      throw new Error("version_invalid: version bytes do not match any of the provided version(s)");
    }
    encodeChecked(C) {
      const B = this._sha256(this._sha256(C)).slice(0, 4);
      return this._encodeRaw(Uint8Array.from((0, n.concatArgs)(C, B)));
    }
    decodeChecked(C) {
      const B = this._decodeRaw(C);
      if (B.byteLength < 5)
        throw new Error("invalid_input_size: decoded data must have length >= 5");
      if (!this._verifyCheckSum(B))
        throw new Error("checksum_invalid");
      return B.slice(0, -4);
    }
    _encodeVersioned(C, B, z) {
      if (!I(C, z))
        throw new Error("unexpected_payload_length: bytes.length does not match expectedLength. Ensure that the bytes are a Uint8Array.");
      return this.encodeChecked((0, n.concatArgs)(B, C));
    }
    _encodeRaw(C) {
      return this._codec.encode(Uint8Array.from(C));
    }
    /* eslint-enable max-lines-per-function */
    _decodeRaw(C) {
      return this._codec.decode(C);
    }
    _verifyCheckSum(C) {
      const B = this._sha256(this._sha256(C.slice(0, -4))).slice(0, 4), z = C.slice(-4);
      return (0, n.arrayEqual)(B, z);
    }
  }
  const t = 0, o = 35, a = 33, d = 28, f = [1, 225, 75], m = {
    sha256: i.sha256
  }, T = new r(m);
  W.codec = T;
  function A(F, C) {
    if (!I(F, 16))
      throw new Error("entropy must have length 16");
    const B = {
      expectedLength: 16,
      // for secp256k1, use `FAMILY_SEED`
      versions: C === "ed25519" ? f : [a]
    };
    return T.encode(F, B);
  }
  W.encodeSeed = A;
  function c(F, C = {
    versionTypes: ["ed25519", "secp256k1"],
    versions: [f, a],
    expectedLength: 16
  }) {
    return T.decode(F, C);
  }
  W.decodeSeed = c;
  function y(F) {
    const C = { versions: [t], expectedLength: 20 };
    return T.encode(F, C);
  }
  W.encodeAccountID = y, W.encodeAddress = y;
  function b(F) {
    const C = { versions: [t], expectedLength: 20 };
    return T.decode(F, C).bytes;
  }
  W.decodeAccountID = b, W.decodeAddress = b;
  function E(F) {
    const C = { versions: [d], expectedLength: 33 };
    return T.decode(F, C).bytes;
  }
  W.decodeNodePublic = E;
  function l(F) {
    const C = { versions: [d], expectedLength: 33 };
    return T.encode(F, C);
  }
  W.encodeNodePublic = l;
  function p(F) {
    const C = { versions: [o], expectedLength: 33 };
    return T.encode(F, C);
  }
  W.encodeAccountPublic = p;
  function D(F) {
    const C = { versions: [o], expectedLength: 33 };
    return T.decode(F, C).bytes;
  }
  W.decodeAccountPublic = D;
  function P(F) {
    try {
      b(F);
    } catch {
      return !1;
    }
    return !0;
  }
  W.isValidClassicAddress = P;
  function I(F, C) {
    return "byteLength" in F ? F.byteLength === C : F.length === C;
  }
  return W;
}
var Zn;
function Ar() {
  return Zn || (Zn = 1, (function(e) {
    Object.defineProperty(e, "__esModule", { value: !0 }), e.isValidXAddress = e.decodeXAddress = e.xAddressToClassicAddress = e.encodeXAddress = e.classicAddressToXAddress = e.isValidClassicAddress = e.decodeAccountPublic = e.encodeAccountPublic = e.decodeNodePublic = e.encodeNodePublic = e.decodeAccountID = e.encodeAccountID = e.decodeSeed = e.encodeSeed = e.codec = void 0;
    const i = te(), n = _a();
    Object.defineProperty(e, "codec", { enumerable: !0, get: function() {
      return n.codec;
    } }), Object.defineProperty(e, "encodeSeed", { enumerable: !0, get: function() {
      return n.encodeSeed;
    } }), Object.defineProperty(e, "decodeSeed", { enumerable: !0, get: function() {
      return n.decodeSeed;
    } }), Object.defineProperty(e, "encodeAccountID", { enumerable: !0, get: function() {
      return n.encodeAccountID;
    } }), Object.defineProperty(e, "decodeAccountID", { enumerable: !0, get: function() {
      return n.decodeAccountID;
    } }), Object.defineProperty(e, "encodeNodePublic", { enumerable: !0, get: function() {
      return n.encodeNodePublic;
    } }), Object.defineProperty(e, "decodeNodePublic", { enumerable: !0, get: function() {
      return n.decodeNodePublic;
    } }), Object.defineProperty(e, "encodeAccountPublic", { enumerable: !0, get: function() {
      return n.encodeAccountPublic;
    } }), Object.defineProperty(e, "decodeAccountPublic", { enumerable: !0, get: function() {
      return n.decodeAccountPublic;
    } }), Object.defineProperty(e, "isValidClassicAddress", { enumerable: !0, get: function() {
      return n.isValidClassicAddress;
    } });
    const r = {
      // 5, 68
      main: Uint8Array.from([5, 68]),
      // 4, 147
      test: Uint8Array.from([4, 147])
    }, t = 4294967295;
    function o(c, y, b) {
      const E = (0, n.decodeAccountID)(c);
      return a(E, y, b);
    }
    e.classicAddressToXAddress = o;
    function a(c, y, b) {
      if (c.length !== 20)
        throw new Error("Account ID must be 20 bytes");
      if (y !== !1 && y > t)
        throw new Error("Invalid tag");
      const E = y || 0, l = y === !1 || y == null ? 0 : 1, p = (0, i.concat)([
        b ? r.test : r.main,
        c,
        Uint8Array.from([
          // 0x00 if no tag, 0x01 if 32-bit tag
          l,
          // first byte
          E & 255,
          // second byte
          E >> 8 & 255,
          // third byte
          E >> 16 & 255,
          // fourth byte
          E >> 24 & 255,
          0,
          0,
          0,
          // four zero bytes (reserved for 64-bit tags)
          0
        ])
      ]);
      return n.codec.encodeChecked(p);
    }
    e.encodeXAddress = a;
    function d(c) {
      const { accountId: y, tag: b, test: E } = f(c);
      return {
        classicAddress: (0, n.encodeAccountID)(y),
        tag: b,
        test: E
      };
    }
    e.xAddressToClassicAddress = d;
    function f(c) {
      const y = n.codec.decodeChecked(c), b = m(y), E = y.slice(2, 22), l = T(y);
      return {
        accountId: E,
        tag: l,
        test: b
      };
    }
    e.decodeXAddress = f;
    function m(c) {
      const y = c.slice(0, 2);
      if ((0, i.equal)(r.main, y))
        return !1;
      if ((0, i.equal)(r.test, y))
        return !0;
      throw new Error("Invalid X-address: bad prefix");
    }
    function T(c) {
      const y = c[22];
      if (y >= 2)
        throw new Error("Unsupported X-address");
      if (y === 1)
        return c[23] + c[24] * 256 + c[25] * 65536 + c[26] * 16777216;
      if (y !== 0)
        throw new Error("flag must be zero to indicate no tag");
      if (!(0, i.equal)((0, i.hexToBytes)("0000000000000000"), c.slice(23, 31)))
        throw new Error("remaining bytes must be zero");
      return !1;
    }
    function A(c) {
      try {
        f(c);
      } catch {
        return !1;
      }
      return !0;
    }
    e.isValidXAddress = A;
  })(nn)), nn;
}
var rt = {}, ot = {}, Y = {}, ei;
function Se() {
  if (ei) return Y;
  ei = 1, Object.defineProperty(Y, "__esModule", { value: !0 }), Y.compare = Y.equal = Y.readInt64BE = Y.readInt32BE = Y.readUInt32BE = Y.readUInt16BE = Y.writeInt64BE = Y.writeInt32BE = Y.writeUInt32BE = Y.writeUInt16BE = Y.writeUInt8 = void 0;
  function e(l, p, D) {
    p = Number(p), l[D] = p;
  }
  Y.writeUInt8 = e;
  function i(l, p, D) {
    p = Number(p), l[D] = p >>> 8, l[D + 1] = p;
  }
  Y.writeUInt16BE = i;
  function n(l, p, D) {
    l[D] = p >>> 24 & 255, l[D + 1] = p >>> 16 & 255, l[D + 2] = p >>> 8 & 255, l[D + 3] = p & 255;
  }
  Y.writeUInt32BE = n;
  function r(l, p, D) {
    new DataView(l.buffer, l.byteOffset, l.byteLength).setInt32(D, p, !1);
  }
  Y.writeInt32BE = r;
  function t(l, p, D) {
    new DataView(l.buffer, l.byteOffset, l.byteLength).setBigInt64(D, p, !1);
  }
  Y.writeInt64BE = t;
  function o(l, p) {
    return new DataView(l.buffer).getUint16(p, !1).toString(10);
  }
  Y.readUInt16BE = o;
  function a(l, p) {
    return new DataView(l.buffer).getUint32(p, !1).toString(10);
  }
  Y.readUInt32BE = a;
  function d(l, p) {
    return new DataView(l.buffer, l.byteOffset, l.byteLength).getInt32(p, !1);
  }
  Y.readInt32BE = d;
  function f(l, p) {
    return new DataView(l.buffer, l.byteOffset, l.byteLength).getBigInt64(p, !1);
  }
  Y.readInt64BE = f;
  function m(l, p) {
    const D = l instanceof ArrayBuffer ? new Uint8Array(l, 0) : l, P = p instanceof ArrayBuffer ? new Uint8Array(p, 0) : p;
    return D.byteLength != P.byteLength ? !1 : E(D) && E(P) ? c(D, P) === 0 : b(D) && b(P) ? A(D, P) === 0 : T(D, P) === 0;
  }
  Y.equal = m;
  function T(l, p) {
    const D = new Uint8Array(l.buffer, l.byteOffset, l.byteLength), P = new Uint8Array(p.buffer, p.byteOffset, p.byteLength);
    return y(D, P);
  }
  function A(l, p) {
    const D = new Uint16Array(l.buffer, l.byteOffset, l.byteLength / 2), P = new Uint16Array(p.buffer, p.byteOffset, p.byteLength / 2);
    return y(D, P);
  }
  function c(l, p) {
    const D = new Uint32Array(l.buffer, l.byteOffset, l.byteLength / 4), P = new Uint32Array(p.buffer, p.byteOffset, p.byteLength / 4);
    return y(D, P);
  }
  function y(l, p) {
    if (l.byteLength !== p.byteLength)
      throw new Error("Cannot compare arrays of different length");
    for (let D = 0; D < l.length; D += 1) {
      if (l[D] > p[D])
        return 1;
      if (l[D] < p[D])
        return -1;
    }
    return 0;
  }
  Y.compare = y;
  function b(l) {
    return l.byteOffset % 2 === 0 && l.byteLength % 2 === 0;
  }
  function E(l) {
    return l.byteOffset % 4 === 0 && l.byteLength % 4 === 0;
  }
  return Y;
}
var ti;
function qt() {
  if (ti) return ot;
  ti = 1, Object.defineProperty(ot, "__esModule", { value: !0 }), ot.Hash = void 0;
  const e = ue(), i = te(), n = Se();
  class r extends e.Comparable {
    constructor(o) {
      if (super(o), this.bytes.length !== this.constructor.width)
        throw new Error(`Invalid Hash length ${this.bytes.byteLength}`);
    }
    /**
     * Construct a Hash object from an existing Hash object or a hex-string
     *
     * @param value A hash object or hex-string of a hash
     */
    static from(o) {
      if (o instanceof this)
        return o;
      if (typeof o == "string") {
        if (!i.HEX_REGEX.test(o))
          throw new Error(`Invalid hash string ${o}`);
        return new this((0, i.hexToBytes)(o));
      }
      throw new Error("Cannot construct Hash from given value");
    }
    /**
     * Read a Hash object from a BinaryParser
     *
     * @param parser BinaryParser to read the hash from
     * @param hint length of the bytes to read, optional
     */
    static fromParser(o, a) {
      return new this(o.read(a ?? this.width));
    }
    /**
     * Overloaded operator for comparing two hash objects
     *
     * @param other The Hash to compare this to
     */
    compareTo(o) {
      return (0, n.compare)(this.bytes, this.constructor.from(o).bytes);
    }
    /**
     * @returns the hex-string representation of this Hash
     */
    toString() {
      return this.toHex();
    }
    /**
     * Returns four bits at the specified depth within a hash
     *
     * @param depth The depth of the four bits
     * @returns The number represented by the four bits
     */
    nibblet(o) {
      const a = o > 0 ? o / 2 | 0 : 0;
      let d = this.bytes[a];
      return o % 2 === 0 ? d = (d & 240) >>> 4 : d = d & 15, d;
    }
  }
  return ot.Hash = r, ot;
}
var ni;
function gn() {
  if (ni) return rt;
  ni = 1, Object.defineProperty(rt, "__esModule", { value: !0 }), rt.Hash160 = void 0;
  const e = qt();
  class i extends e.Hash {
    constructor(r) {
      r?.byteLength === 0 && (r = i.ZERO_160.bytes), super(r ?? i.ZERO_160.bytes);
    }
  }
  return rt.Hash160 = i, i.width = 20, i.ZERO_160 = new i(new Uint8Array(i.width)), rt;
}
var ii;
function Nt() {
  if (ii) return nt;
  ii = 1, Object.defineProperty(nt, "__esModule", { value: !0 }), nt.AccountID = void 0;
  const e = Ar(), i = gn(), n = te(), r = /^[A-F0-9]{40}$/;
  class t extends i.Hash160 {
    constructor(a) {
      super(a ?? t.defaultAccountID.bytes);
    }
    /**
     * Defines how to construct an AccountID
     *
     * @param value either an existing AccountID, a hex-string, or a base58 r-Address
     * @returns an AccountID object
     */
    static from(a) {
      if (a instanceof t)
        return a;
      if (typeof a == "string")
        return a === "" ? new t() : r.test(a) ? new t((0, n.hexToBytes)(a)) : this.fromBase58(a);
      throw new Error("Cannot construct AccountID from value given");
    }
    /**
     * Defines how to build an AccountID from a base58 r-Address
     *
     * @param value a base58 r-Address
     * @returns an AccountID object
     */
    static fromBase58(a) {
      if ((0, e.isValidXAddress)(a)) {
        const d = (0, e.xAddressToClassicAddress)(a);
        if (d.tag !== !1)
          throw new Error("Only allowed to have tag on Account or Destination");
        a = d.classicAddress;
      }
      return new t(Uint8Array.from((0, e.decodeAccountID)(a)));
    }
    /**
     * Overload of toJSON
     *
     * @returns the base58 string for this AccountID
     */
    toJSON() {
      return this.toBase58();
    }
    /**
     * Defines how to encode AccountID into a base58 address
     *
     * @returns the base58 string defined by this.bytes
     */
    toBase58() {
      return (0, e.encodeAccountID)(this.bytes);
    }
  }
  return nt.AccountID = t, t.defaultAccountID = new t(new Uint8Array(20)), nt;
}
var ze = {}, at = {}, ri;
function Pe() {
  if (ri) return at;
  ri = 1, Object.defineProperty(at, "__esModule", { value: !0 }), at.BinaryParser = void 0;
  const e = Ne(), i = te();
  class n {
    /**
     * Initialize bytes to a hex string
     *
     * @param hexBytes a hex string
     * @param definitions Rippled definitions used to parse the values of transaction types and such.
     *                          Can be customized for sidechains and amendments.
     */
    constructor(t, o = e.DEFAULT_DEFINITIONS) {
      this.bytes = (0, i.hexToBytes)(t), this.definitions = o;
    }
    /**
     * Peek the first byte of the BinaryParser
     *
     * @returns The first byte of the BinaryParser
     */
    peek() {
      if (this.bytes.byteLength === 0)
        throw new Error();
      return this.bytes[0];
    }
    /**
     * Consume the first n bytes of the BinaryParser
     *
     * @param n the number of bytes to skip
     */
    skip(t) {
      if (t < 0)
        throw new Error(`skip: negative length ${t}`);
      if (t > this.bytes.byteLength)
        throw new Error(`skip: requested ${t} bytes but only ${this.bytes.byteLength} available`);
      this.bytes = this.bytes.slice(t);
    }
    /**
     * read the first n bytes from the BinaryParser
     *
     * @param n The number of bytes to read
     * @return The bytes
     */
    read(t) {
      if (t < 0)
        throw new Error(`read: negative length ${t}`);
      if (t > this.bytes.byteLength)
        throw new Error(`read: requested ${t} bytes but only ${this.bytes.byteLength} available`);
      const o = this.bytes.slice(0, t);
      return this.skip(t), o;
    }
    /**
     * Read an integer of given size
     *
     * @param n The number of bytes to read
     * @return The number represented by those bytes
     */
    readUIntN(t) {
      if (0 >= t || t > 4)
        throw new Error("invalid n");
      return this.read(t).reduce((o, a) => o << 8 | a) >>> 0;
    }
    readUInt8() {
      return this.readUIntN(1);
    }
    readUInt16() {
      return this.readUIntN(2);
    }
    readUInt32() {
      return this.readUIntN(4);
    }
    size() {
      return this.bytes.byteLength;
    }
    end(t) {
      const o = this.bytes.byteLength;
      return o === 0 || t !== void 0 && o <= t;
    }
    /**
     * Reads variable length encoded bytes
     *
     * @return The variable length bytes
     */
    readVariableLength() {
      return this.read(this.readVariableLengthLength());
    }
    /**
     * Reads the length of the variable length encoded bytes
     *
     * @return The length of the variable length encoded bytes
     */
    readVariableLengthLength() {
      const t = this.readUInt8();
      if (t <= 192)
        return t;
      if (t <= 240) {
        const o = this.readUInt8();
        return 193 + (t - 193) * 256 + o;
      } else if (t <= 254) {
        const o = this.readUInt8(), a = this.readUInt8();
        return 12481 + (t - 241) * 65536 + o * 256 + a;
      }
      throw new Error("Invalid variable length indicator");
    }
    /**
     * Reads the field ordinal from the BinaryParser
     *
     * @return Field ordinal
     */
    readFieldOrdinal() {
      let t = this.readUInt8(), o = t & 15;
      if (t >>= 4, t === 0 && (t = this.readUInt8(), t === 0 || t < 16))
        throw new Error(`Cannot read FieldOrdinal, type_code ${t} out of range`);
      if (o === 0 && (o = this.readUInt8(), o === 0 || o < 16))
        throw new Error(`Cannot read FieldOrdinal, field_code ${o} out of range`);
      return t << 16 | o;
    }
    /**
     * Read the field from the BinaryParser
     *
     * @return The field represented by the bytes at the head of the BinaryParser
     */
    readField() {
      return this.definitions.field.fromString(this.readFieldOrdinal().toString());
    }
    /**
     * Read a given type from the BinaryParser
     *
     * @param type The type that you want to read from the BinaryParser
     * @return The instance of that type read from the BinaryParser
     */
    readType(t) {
      return t.fromParser(this);
    }
    /**
     * Get the type associated with a given field
     *
     * @param field The field that you wan to get the type of
     * @return The type associated with the given field
     */
    typeForField(t) {
      return t.associatedType;
    }
    /**
     * Read value of the type specified by field from the BinaryParser
     *
     * @param field The field that you want to get the associated value for
     * @return The value associated with the given field
     */
    readFieldValue(t) {
      const o = this.typeForField(t);
      if (!o)
        throw new Error(`unsupported: (${t.name}, ${t.type.name})`);
      const a = t.isVariableLengthEncoded ? this.readVariableLengthLength() : void 0, d = o.fromParser(this, a);
      if (d === void 0)
        throw new Error(`fromParser for (${t.name}, ${t.type.name}) -> undefined `);
      return d;
    }
    /**
     * Get the next field and value from the BinaryParser
     *
     * @return The field and value
     */
    readFieldAndValue() {
      const t = this.readField();
      return [t, this.readFieldValue(t)];
    }
  }
  return at.BinaryParser = n, at;
}
var st = {}, oi;
function Xt() {
  if (oi) return st;
  oi = 1, Object.defineProperty(st, "__esModule", { value: !0 }), st.Currency = void 0;
  const e = gn(), i = te(), n = /^0{40}$/, r = /^[A-Z0-9a-z?!@#$%^&*(){}[\]|]{3}$/, t = /^[A-F0-9]{40}$/, o = /^0{24}[\x00-\x7F]{6}0{10}$/;
  function a(E) {
    const l = new Uint8Array(20);
    if (E !== "XRP") {
      const p = E.split("").map((D) => D.charCodeAt(0));
      l.set(p, 12);
    }
    return l;
  }
  function d(E) {
    return r.test(E);
  }
  function f(E) {
    const l = (0, i.hexToString)((0, i.bytesToHex)(E));
    return l === "XRP" ? null : d(l) ? l : null;
  }
  function m(E) {
    return t.test(E);
  }
  function T(E) {
    return E.length === 3 || m(E);
  }
  function A(E) {
    return E.byteLength === 20;
  }
  function c(E) {
    return E instanceof Uint8Array ? A(E) : T(E);
  }
  function y(E) {
    if (!c(E))
      throw new Error(`Unsupported Currency representation: ${E}`);
    return E.length === 3 ? a(E) : (0, i.hexToBytes)(E);
  }
  class b extends e.Hash160 {
    constructor(l) {
      super(l ?? b.XRP.bytes);
      const p = (0, i.bytesToHex)(this.bytes);
      n.test(p) ? this._iso = "XRP" : o.test(p) ? this._iso = f(this.bytes.slice(12, 15)) : this._iso = null;
    }
    /**
     * Return the ISO code of this currency
     *
     * @returns ISO code if it exists, else null
     */
    iso() {
      return this._iso;
    }
    /**
     * Constructs a Currency object
     *
     * @param val Currency object or a string representation of a currency
     */
    static from(l) {
      if (l instanceof b)
        return l;
      if (typeof l == "string")
        return new b(y(l));
      throw new Error("Cannot construct Currency from value given");
    }
    /**
     * Gets the JSON representation of a currency
     *
     * @returns JSON representation
     */
    toJSON() {
      const l = this.iso();
      return l !== null ? l : (0, i.bytesToHex)(this.bytes);
    }
  }
  return st.Currency = b, b.XRP = new b(new Uint8Array(20)), st;
}
var on, ai;
function mn() {
  if (ai) return on;
  ai = 1;
  var e = A(), i = /^-?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i, n = Math.ceil, r = Math.floor, t = "[BigNumber Error] ", o = 1e14, a = 14, d = 9007199254740991, f = [1, 10, 100, 1e3, 1e4, 1e5, 1e6, 1e7, 1e8, 1e9, 1e10, 1e11, 1e12, 1e13], m = 1e7, T = 1e9;
  function A(P) {
    var I, F, C, B = M.prototype = { constructor: M, toString: null, valueOf: null }, z = new M(1), R = 20, v = 4, V = -7, q = 21, G = -1e7, Q = 1e7, he = !1, re = 1, pe = 0, Kt = {
      prefix: "",
      groupSize: 3,
      secondaryGroupSize: 0,
      groupSeparator: ",",
      decimalSeparator: ".",
      fractionGroupSize: 0,
      fractionGroupSeparator: " ",
      // non-breaking space
      suffix: ""
    }, Ce = "0123456789abcdefghijklmnopqrstuvwxyz";
    function M(s, u) {
      var h, L, _, w, N, S, g, x, O = this;
      if (!(O instanceof M)) return new M(s, u);
      if (x = typeof s, u == null) {
        if (Tn(s)) {
          O.s = s.s, !s.c || s.e > Q ? O.c = O.e = null : s.e < G ? O.c = [O.e = 0] : (O.e = s.e, O.c = s.c.slice());
          return;
        }
        if (x == "number") {
          if (s * 0 != 0) {
            O.s = isNaN(s) ? null : s < 0 ? -1 : 1, O.c = O.e = null;
            return;
          }
          if (O.s = 1 / s < 0 ? (s = -s, -1) : 1, s === ~~s) {
            for (w = 0, N = s; N >= 10; N /= 10, w++) ;
            w > Q ? O.c = O.e = null : (O.e = w, O.c = [s]);
            return;
          }
          g = String(s);
        } else {
          if (x == "string") {
            if (g = s, !i.test(g))
              return C(O, g);
          } else if (x == "bigint")
            g = String(s);
          else
            throw Error(t + "Invalid argument: " + s);
          O.s = g.charCodeAt(0) == 45 ? (g = g.slice(1), -1) : 1;
        }
        (w = g.indexOf(".")) > -1 && (g = g.replace(".", "")), (N = g.search(/e/i)) > 0 ? (w < 0 && (w = N), w += +g.slice(N + 1), g = g.substring(0, N)) : w < 0 && (w = g.length);
      } else {
        if (x != "string")
          throw Error(t + "String expected: " + s);
        for (E(u, 2, Ce.length, "Base"), g = s, O.s = g.charCodeAt(0) === 45 ? (g = g.slice(1), -1) : 1, h = Ce.slice(0, u), w = N = 0, S = g.length; N < S; N++)
          if (h.indexOf(L = g.charAt(N)) < 0) {
            if (L == ".") {
              if (N > w) {
                w = S;
                continue;
              }
            } else if (!_ && (g == g.toUpperCase() && (g = g.toLowerCase()) || g == g.toLowerCase() && (g = g.toUpperCase()))) {
              _ = !0, N = -1, w = 0;
              continue;
            }
            return C(O, s, u);
          }
        g = F(g, u, 10, O.s), (w = g.indexOf(".")) > -1 ? g = g.replace(".", "") : w = g.length;
      }
      for (N = 0; g.charCodeAt(N) === 48; N++) ;
      for (S = g.length; g.charCodeAt(--S) === 48; ) ;
      if (g = g.slice(N, ++S))
        if (S -= N, w = w - N - 1, w > Q)
          O.c = O.e = null;
        else if (w < G)
          O.c = [O.e = 0];
        else {
          if (O.e = w, O.c = [], N = (w + 1) % a, w < 0 && (N += a), N < S) {
            for (N && O.c.push(+g.slice(0, N)), S -= a; N < S; )
              O.c.push(+g.slice(N, N += a));
            N = a - (g = g.slice(N)).length;
          } else
            N -= S;
          for (; N--; g += "0") ;
          O.c.push(+g);
        }
      else
        O.c = [O.e = 0];
    }
    M.clone = A, M.ROUND_UP = 0, M.ROUND_DOWN = 1, M.ROUND_CEIL = 2, M.ROUND_FLOOR = 3, M.ROUND_HALF_UP = 4, M.ROUND_HALF_DOWN = 5, M.ROUND_HALF_EVEN = 6, M.ROUND_HALF_CEIL = 7, M.ROUND_HALF_FLOOR = 8, M.EUCLID = 9, M.config = M.set = function(s) {
      var u, h;
      if (s != null)
        if (typeof s == "object") {
          if (s.hasOwnProperty(u = "DECIMAL_PLACES") && (h = s[u], E(h, 0, T, u), R = h), s.hasOwnProperty(u = "ROUNDING_MODE") && (h = s[u], E(h, 0, 8, u), v = h), s.hasOwnProperty(u = "EXPONENTIAL_AT") && (h = s[u], h && h.pop ? (E(h[0], -T, 0, u), E(h[1], 0, T, u), V = h[0], q = h[1]) : (E(h, -T, T, u), V = -(q = h < 0 ? -h : h))), s.hasOwnProperty(u = "RANGE"))
            if (h = s[u], h && h.pop)
              E(h[0], -T, -1, u), E(h[1], 1, T, u), G = h[0], Q = h[1];
            else if (E(h, -T, T, u), h)
              G = -(Q = h < 0 ? -h : h);
            else
              throw Error(t + u + " cannot be zero: " + h);
          if (s.hasOwnProperty(u = "CRYPTO"))
            if (h = s[u], h === !!h)
              if (h)
                if (typeof crypto < "u" && crypto && (crypto.getRandomValues || crypto.randomBytes))
                  he = h;
                else
                  throw he = !h, Error(t + "crypto unavailable");
              else
                he = h;
            else
              throw Error(t + u + " not true or false: " + h);
          if (s.hasOwnProperty(u = "MODULO_MODE") && (h = s[u], E(h, 0, 9, u), re = h), s.hasOwnProperty(u = "POW_PRECISION") && (h = s[u], E(h, 0, T, u), pe = h), s.hasOwnProperty(u = "FORMAT"))
            if (h = s[u], typeof h == "object") Kt = h;
            else throw Error(t + u + " not an object: " + h);
          if (s.hasOwnProperty(u = "ALPHABET"))
            if (h = s[u], typeof h == "string" && !/^.?$|[+\-.\s]|(.).*\1/.test(h))
              Ce = h;
            else
              throw Error(t + u + " invalid: " + h);
        } else
          throw Error(t + "Object expected: " + s);
      return {
        DECIMAL_PLACES: R,
        ROUNDING_MODE: v,
        EXPONENTIAL_AT: [V, q],
        RANGE: [G, Q],
        CRYPTO: he,
        MODULO_MODE: re,
        POW_PRECISION: pe,
        FORMAT: Kt,
        ALPHABET: Ce
      };
    }, M.isBigNumber = function(s) {
      if (!Tn(s)) return !1;
      var u, h, L = s.c, _ = s.e, w = s.s;
      if ({}.toString.call(L) != "[object Array]")
        return L === null && _ === null && (w === null || w === 1 || w === -1);
      if (w !== 1 && w !== -1 || _ < -T || _ > T || _ !== r(_))
        return !1;
      if (L[0] === 0)
        return _ === 0 && L.length === 1;
      if (u = (_ + 1) % a, u < 1 && (u += a), String(L[0]).length !== u)
        return !1;
      for (u = 0; u < L.length; u++)
        if (h = L[u], h < 0 || h >= o || h !== r(h)) return !1;
      return h !== 0;
    }, M.maximum = M.max = function() {
      return bn(arguments, -1);
    }, M.minimum = M.min = function() {
      return bn(arguments, 1);
    }, M.random = (function() {
      var s = 9007199254740992, u = Math.random() * s & 2097151 ? function() {
        return r(Math.random() * s);
      } : function() {
        return (Math.random() * 1073741824 | 0) * 8388608 + (Math.random() * 8388608 | 0);
      };
      return function(h) {
        var L, _, w, N, S, g = 0, x = [], O = new M(z);
        if (h == null ? h = R : E(h, 0, T), N = n(h / a), he)
          if (crypto.getRandomValues) {
            for (L = crypto.getRandomValues(new Uint32Array(N *= 2)); g < N; )
              S = L[g] * 131072 + (L[g + 1] >>> 11), S >= 9e15 ? (_ = crypto.getRandomValues(new Uint32Array(2)), L[g] = _[0], L[g + 1] = _[1]) : (x.push(S % 1e14), g += 2);
            g = N / 2;
          } else if (crypto.randomBytes) {
            for (L = crypto.randomBytes(N *= 7); g < N; )
              S = (L[g] & 31) * 281474976710656 + L[g + 1] * 1099511627776 + L[g + 2] * 4294967296 + L[g + 3] * 16777216 + (L[g + 4] << 16) + (L[g + 5] << 8) + L[g + 6], S >= 9e15 ? crypto.randomBytes(7).copy(L, g) : (x.push(S % 1e14), g += 7);
            g = N / 7;
          } else
            throw he = !1, Error(t + "crypto unavailable");
        if (!he)
          for (; g < N; )
            S = u(), S < 9e15 && (x[g++] = S % 1e14);
        for (N = x[--g], h %= a, N && h && (S = f[a - h], x[g] = r(N / S) * S); x[g] === 0; x.pop(), g--) ;
        if (g < 0)
          x = [w = 0];
        else {
          for (w = -1; x[0] === 0; x.splice(0, 1), w -= a) ;
          for (g = 1, S = x[0]; S >= 10; S /= 10, g++) ;
          g < a && (w -= a - g);
        }
        return O.e = w, O.c = x, O;
      };
    })(), M.sum = function() {
      for (var s = 1, u = arguments, h = new M(u[0]); s < u.length; ) h = h.plus(u[s++]);
      return h;
    }, F = /* @__PURE__ */ (function() {
      var s = "0123456789";
      function u(h, L, _, w) {
        for (var N, S = [0], g, x = 0, O = h.length; x < O; ) {
          for (g = S.length; g--; S[g] *= L) ;
          for (S[0] += w.indexOf(h.charAt(x++)), N = 0; N < S.length; N++)
            S[N] > _ - 1 && (S[N + 1] == null && (S[N + 1] = 0), S[N + 1] += S[N] / _ | 0, S[N] %= _);
        }
        return S.reverse();
      }
      return function(h, L, _, w, N) {
        var S, g, x, O, U, H, k, $, Z = h.indexOf("."), ne = R, X = v;
        for (Z >= 0 && (O = pe, pe = 0, h = h.replace(".", ""), $ = new M(L), H = $.pow(h.length - Z), pe = O, $.c = u(
          D(y(H.c), H.e, "0"),
          10,
          _,
          s
        ), $.e = $.c.length), k = u(h, L, _, N ? (S = Ce, s) : (S = s, Ce)), x = O = k.length; k[--O] == 0; k.pop()) ;
        if (!k[0]) return S.charAt(0);
        if (Z < 0 ? --x : (H.c = k, H.e = x, H.s = w, H = I(H, $, ne, X, _), k = H.c, U = H.r, x = H.e), g = x + ne + 1, Z = k[g], O = _ / 2, U = U || g < 0 || k[g + 1] != null, U = X < 4 ? (Z != null || U) && (X == 0 || X == (H.s < 0 ? 3 : 2)) : Z > O || Z == O && (X == 4 || U || X == 6 && k[g - 1] & 1 || X == (H.s < 0 ? 8 : 7)), g < 1 || !k[0])
          h = U ? D(S.charAt(1), -ne, S.charAt(0)) : S.charAt(0);
        else {
          if (k.length = g, U)
            for (--_; ++k[--g] > _; )
              k[g] = 0, g || (++x, k = [1].concat(k));
          for (O = k.length; !k[--O]; ) ;
          for (Z = 0, h = ""; Z <= O; h += S.charAt(k[Z++])) ;
          h = D(h, x, S.charAt(0));
        }
        return h;
      };
    })(), I = /* @__PURE__ */ (function() {
      function s(L, _, w) {
        var N, S, g, x, O = 0, U = L.length, H = _ % m, k = _ / m | 0;
        for (L = L.slice(); U--; )
          g = L[U] % m, x = L[U] / m | 0, N = k * g + x * H, S = H * g + N % m * m + O, O = (S / w | 0) + (N / m | 0) + k * x, L[U] = S % w;
        return O && (L = [O].concat(L)), L;
      }
      function u(L, _, w, N) {
        var S, g;
        if (w != N)
          g = w > N ? 1 : -1;
        else
          for (S = g = 0; S < w; S++)
            if (L[S] != _[S]) {
              g = L[S] > _[S] ? 1 : -1;
              break;
            }
        return g;
      }
      function h(L, _, w, N) {
        for (var S = 0; w--; )
          L[w] -= S, S = L[w] < _[w] ? 1 : 0, L[w] = S * N + L[w] - _[w];
        for (; !L[0] && L.length > 1; L.splice(0, 1)) ;
      }
      return function(L, _, w, N, S) {
        var g, x, O, U, H, k, $, Z, ne, X, K, ie, Ct, Jt, Qt, Ae, Ze, fe = L.s == _.s ? 1 : -1, oe = L.c, ee = _.c;
        if (!oe || !oe[0] || !ee || !ee[0])
          return new M(
            // Return NaN if either NaN, or both Infinity or 0.
            !L.s || !_.s || (oe ? ee && oe[0] == ee[0] : !ee) ? NaN : (
              // Return ±0 if x is ±0 or y is ±Infinity, or return ±Infinity as y is ±0.
              oe && oe[0] == 0 || !ee ? fe * 0 : fe / 0
            )
          );
        for (Z = new M(fe), ne = Z.c = [], x = L.e - _.e, fe = w + x + 1, S || (S = o, x = c(L.e / a) - c(_.e / a), fe = fe / a | 0), O = 0; ee[O] == (oe[O] || 0); O++) ;
        if (ee[O] > (oe[O] || 0) && x--, fe < 0)
          ne.push(1), U = !0;
        else {
          for (Jt = oe.length, Ae = ee.length, O = 0, fe += 2, H = r(S / (ee[0] + 1)), H > 1 && (ee = s(ee, H, S), oe = s(oe, H, S), Ae = ee.length, Jt = oe.length), Ct = Ae, X = oe.slice(0, Ae), K = X.length; K < Ae; X[K++] = 0) ;
          Ze = ee.slice(), Ze = [0].concat(Ze), Qt = ee[0], ee[1] >= S / 2 && Qt++;
          do {
            if (H = 0, g = u(ee, X, Ae, K), g < 0) {
              if (ie = X[0], Ae != K && (ie = ie * S + (X[1] || 0)), H = r(ie / Qt), H > 1)
                for (H >= S && (H = S - 1), k = s(ee, H, S), $ = k.length, K = X.length; u(k, X, $, K) == 1; )
                  H--, h(k, Ae < $ ? Ze : ee, $, S), $ = k.length, g = 1;
              else
                H == 0 && (g = H = 1), k = ee.slice(), $ = k.length;
              if ($ < K && (k = [0].concat(k)), h(X, k, K, S), K = X.length, g == -1)
                for (; u(ee, X, Ae, K) < 1; )
                  H++, h(X, Ae < K ? Ze : ee, K, S), K = X.length;
            } else g === 0 && (H++, X = [0]);
            ne[O++] = H, X[0] ? X[K++] = oe[Ct] || 0 : (X = [oe[Ct]], K = 1);
          } while ((Ct++ < Jt || X[0] != null) && fe--);
          U = X[0] != null, ne[0] || ne.splice(0, 1);
        }
        if (S == o) {
          for (O = 1, fe = ne[0]; fe >= 10; fe /= 10, O++) ;
          Ee(Z, w + (Z.e = O + x * a - 1) + 1, N, U);
        } else
          Z.e = x, Z.r = +U;
        return Z;
      };
    })();
    function Wt(s, u, h, L) {
      var _, w, N, S, g;
      if (h == null ? h = v : E(h, 0, 8), !s.c) return s.toString();
      if (_ = s.c[0], N = s.e, u == null)
        g = y(s.c), g = L == 1 || L == 2 && (N <= V || N >= q) ? p(g, N) : D(g, N, "0");
      else if (s = Ee(new M(s), u, h), w = s.e, g = y(s.c), S = g.length, L == 1 || L == 2 && (u <= w || w <= V)) {
        for (; S < u; g += "0", S++) ;
        g = p(g, w);
      } else if (u -= N + (L === 2 && w > N), g = D(g, w, "0"), w + 1 > S) {
        if (--u > 0) for (g += "."; u--; g += "0") ;
      } else if (u += w - S, u > 0)
        for (w + 1 == S && (g += "."); u--; g += "0") ;
      return s.s < 0 && _ ? "-" + g : g;
    }
    function Tn(s) {
      return s instanceof M || !!s && s._isBigNumber === !0;
    }
    function bn(s, u) {
      for (var h, L, _ = 1, w = new M(s[0]); _ < s.length; _++)
        L = new M(s[_]), (!L.s || (h = b(w, L)) === u || h === 0 && w.s === u) && (w = L);
      return w;
    }
    function Yt(s, u, h) {
      for (var L = 1, _ = u.length; !u[--_]; u.pop()) ;
      for (_ = u[0]; _ >= 10; _ /= 10, L++) ;
      return (h = L + h * a - 1) > Q ? s.c = s.e = null : h < G ? s.c = [s.e = 0] : (s.e = h, s.c = u), s;
    }
    C = /* @__PURE__ */ (function() {
      var s = /^(-?)0([xbo])(?=\w[\w.]*$)/i, u = /^([^.]+)\.$/, h = /^\.([^.]+)$/, L = /^-?(Infinity|NaN)$/, _ = /^\s*\+(?=[\w.])|^\s+|\s+$/g;
      return function(w, N, S) {
        var g, x = N.replace(_, "");
        if (L.test(x)) {
          w.s = isNaN(x) ? null : x < 0 ? -1 : 1, w.c = w.e = null;
          return;
        }
        if (x = x.replace(s, function(O, U, H) {
          return g = (H = H.toLowerCase()) == "x" ? 16 : H == "b" ? 2 : 8, !S || S == g ? U : O;
        }), S && (g = S, x = x.replace(u, "$1").replace(h, "0.$1")), N != x) return new M(x, g);
        throw Error(t + "Not a" + (S ? " base " + S : "") + " number: " + N);
      };
    })();
    function Ee(s, u, h, L) {
      var _, w, N, S, g, x, O, U = s.c, H = f;
      if (U) {
        e: {
          for (_ = 1, S = U[0]; S >= 10; S /= 10, _++) ;
          if (w = u - _, w < 0)
            w += a, N = u, g = U[x = 0], O = r(g / H[_ - N - 1] % 10);
          else if (x = n((w + 1) / a), x >= U.length)
            if (L) {
              for (; U.length <= x; U.push(0)) ;
              g = O = 0, _ = 1, w %= a, N = w - a + 1;
            } else
              break e;
          else {
            for (g = S = U[x], _ = 1; S >= 10; S /= 10, _++) ;
            w %= a, N = w - a + _, O = N < 0 ? 0 : r(g / H[_ - N - 1] % 10);
          }
          if (L = L || u < 0 || // Are there any non-zero digits after the rounding digit?
          // The expression  n % pows10[d - j - 1]  returns all digits of n to the right
          // of the digit at j, e.g. if n is 908714 and j is 2, the expression gives 714.
          U[x + 1] != null || (N < 0 ? g : g % H[_ - N - 1]), L = h < 4 ? (O || L) && (h == 0 || h == (s.s < 0 ? 3 : 2)) : O > 5 || O == 5 && (h == 4 || L || h == 6 && // Check whether the digit to the left of the rounding digit is odd.
          (w > 0 ? N > 0 ? g / H[_ - N] : 0 : U[x - 1]) % 10 & 1 || h == (s.s < 0 ? 8 : 7)), u < 1 || !U[0])
            return U.length = 0, L ? (u -= s.e + 1, U[0] = H[(a - u % a) % a], s.e = -u || 0) : U[0] = s.e = 0, s;
          if (w == 0 ? (U.length = x, S = 1, x--) : (U.length = x + 1, S = H[a - w], U[x] = N > 0 ? r(g / H[_ - N] % H[N]) * S : 0), L)
            for (; ; )
              if (x == 0) {
                for (w = 1, N = U[0]; N >= 10; N /= 10, w++) ;
                for (N = U[0] += S, S = 1; N >= 10; N /= 10, S++) ;
                w != S && (s.e++, U[0] == o && (U[0] = 1));
                break;
              } else {
                if (U[x] += S, U[x] != o) break;
                U[x--] = 0, S = 1;
              }
          for (w = U.length; U[--w] === 0; U.pop()) ;
        }
        s.e > Q ? s.c = s.e = null : s.e < G && (s.c = [s.e = 0]);
      }
      return s;
    }
    function Ie(s) {
      var u, h = s.e;
      return h === null ? s.toString() : (u = y(s.c), u = h <= V || h >= q ? p(u, h) : D(u, h, "0"), s.s < 0 ? "-" + u : u);
    }
    return B.absoluteValue = B.abs = function() {
      var s = new M(this);
      return s.s < 0 && (s.s = 1), s;
    }, B.comparedTo = function(s, u) {
      return b(this, new M(s, u));
    }, B.decimalPlaces = B.dp = function(s, u) {
      var h, L, _, w = this;
      if (s != null)
        return E(s, 0, T), u == null ? u = v : E(u, 0, 8), Ee(new M(w), s + w.e + 1, u);
      if (!(h = w.c)) return null;
      if (L = ((_ = h.length - 1) - c(this.e / a)) * a, _ = h[_]) for (; _ % 10 == 0; _ /= 10, L--) ;
      return L < 0 && (L = 0), L;
    }, B.dividedBy = B.div = function(s, u) {
      return I(this, new M(s, u), R, v);
    }, B.dividedToIntegerBy = B.idiv = function(s, u) {
      return I(this, new M(s, u), 0, 1);
    }, B.exponentiatedBy = B.pow = function(s, u) {
      var h, L, _, w, N, S, g, x, O, U = this;
      if (s = new M(s), s.c && !s.isInteger())
        throw Error(t + "Exponent not an integer: " + Ie(s));
      if (u != null && (u = new M(u)), S = s.e > 14, !U.c || !U.c[0] || U.c[0] == 1 && !U.e && U.c.length == 1 || !s.c || !s.c[0])
        return O = new M(Math.pow(+Ie(U), S ? s.s * (2 - l(s)) : +Ie(s))), u ? O.mod(u) : O;
      if (g = s.s < 0, u) {
        if (u.c ? !u.c[0] : !u.s) return new M(NaN);
        L = !g && U.isInteger() && u.isInteger(), L && (U = U.mod(u));
      } else {
        if (s.e > 9 && (U.e > 0 || U.e < -1 || (U.e == 0 ? U.c[0] > 1 || S && U.c[1] >= 24e7 : U.c[0] < 8e13 || S && U.c[0] <= 9999975e7)))
          return w = U.s < 0 && l(s) ? -0 : 0, U.e > -1 && (w = 1 / w), new M(g ? 1 / w : w);
        pe && (w = n(pe / a + 2));
      }
      for (S ? (h = new M(0.5), g && (s.s = 1), x = l(s)) : (_ = Math.abs(+Ie(s)), x = _ % 2), O = new M(z); ; ) {
        if (x) {
          if (O = O.times(U), !O.c) break;
          w ? O.c.length > w && (O.c.length = w) : L && (O = O.mod(u));
        }
        if (_) {
          if (_ = r(_ / 2), _ === 0) break;
          x = _ % 2;
        } else if (s = s.times(h), Ee(s, s.e + 1, 1), s.e > 14)
          x = l(s);
        else {
          if (_ = +Ie(s), _ === 0) break;
          x = _ % 2;
        }
        U = U.times(U), w ? U.c && U.c.length > w && (U.c.length = w) : L && (U = U.mod(u));
      }
      return L ? O : (g && (O = z.div(O)), u ? O.mod(u) : w ? Ee(O, pe, v, N) : O);
    }, B.integerValue = function(s) {
      var u = new M(this);
      return s == null ? s = v : E(s, 0, 8), Ee(u, u.e + 1, s);
    }, B.isEqualTo = B.eq = function(s, u) {
      return b(this, new M(s, u)) === 0;
    }, B.isFinite = function() {
      return !!this.c;
    }, B.isGreaterThan = B.gt = function(s, u) {
      return b(this, new M(s, u)) > 0;
    }, B.isGreaterThanOrEqualTo = B.gte = function(s, u) {
      return (u = b(this, new M(s, u))) === 1 || u === 0;
    }, B.isInteger = function() {
      return !!this.c && c(this.e / a) > this.c.length - 2;
    }, B.isLessThan = B.lt = function(s, u) {
      return b(this, new M(s, u)) < 0;
    }, B.isLessThanOrEqualTo = B.lte = function(s, u) {
      return (u = b(this, new M(s, u))) === -1 || u === 0;
    }, B.isNaN = function() {
      return !this.s;
    }, B.isNegative = function() {
      return this.s < 0;
    }, B.isPositive = function() {
      return this.s > 0;
    }, B.isZero = function() {
      return !!this.c && this.c[0] == 0;
    }, B.minus = function(s, u) {
      var h, L, _, w, N = this, S = N.s;
      if (s = new M(s, u), u = s.s, !S || !u) return new M(NaN);
      if (S != u)
        return s.s = -u, N.plus(s);
      var g = N.e / a, x = s.e / a, O = N.c, U = s.c;
      if (!g || !x) {
        if (!O || !U) return O ? (s.s = -u, s) : new M(U ? N : NaN);
        if (!O[0] || !U[0])
          return U[0] ? (s.s = -u, s) : new M(O[0] ? N : (
            // IEEE 754 (2008) 6.3: n - n = -0 when rounding to -Infinity
            v == 3 ? -0 : 0
          ));
      }
      if (g = c(g), x = c(x), O = O.slice(), S = g - x) {
        for ((w = S < 0) ? (S = -S, _ = O) : (x = g, _ = U), _.reverse(), u = S; u--; _.push(0)) ;
        _.reverse();
      } else
        for (L = (w = (S = O.length) < (u = U.length)) ? S : u, S = u = 0; u < L; u++)
          if (O[u] != U[u]) {
            w = O[u] < U[u];
            break;
          }
      if (w && (_ = O, O = U, U = _, s.s = -s.s), u = (L = U.length) - (h = O.length), u > 0) for (; u--; O[h++] = 0) ;
      for (u = o - 1; L > S; ) {
        if (O[--L] < U[L]) {
          for (h = L; h && !O[--h]; O[h] = u) ;
          --O[h], O[L] += o;
        }
        O[L] -= U[L];
      }
      for (; O[0] == 0; O.splice(0, 1), --x) ;
      return O[0] ? Yt(s, O, x) : (s.s = v == 3 ? -1 : 1, s.c = [s.e = 0], s);
    }, B.modulo = B.mod = function(s, u) {
      var h, L, _ = this;
      return s = new M(s, u), !_.c || !s.s || s.c && !s.c[0] ? new M(NaN) : !s.c || _.c && !_.c[0] ? new M(_) : (re == 9 ? (L = s.s, s.s = 1, h = I(_, s, 0, 3), s.s = L, h.s *= L) : h = I(_, s, 0, re), s = _.minus(h.times(s)), !s.c[0] && re == 1 && (s.s = _.s), s);
    }, B.multipliedBy = B.times = function(s, u) {
      var h, L, _, w, N, S, g, x, O, U, H, k, $, Z, ne, X = this, K = X.c, ie = (s = new M(s, u)).c;
      if (!K || !ie || !K[0] || !ie[0])
        return !X.s || !s.s || K && !K[0] && !ie || ie && !ie[0] && !K ? s.c = s.e = s.s = null : (s.s *= X.s, !K || !ie ? s.c = s.e = null : (s.c = [0], s.e = 0)), s;
      for (L = c(X.e / a) + c(s.e / a), s.s *= X.s, g = K.length, U = ie.length, g < U && ($ = K, K = ie, ie = $, _ = g, g = U, U = _), _ = g + U, $ = []; _--; $.push(0)) ;
      for (Z = o, ne = m, _ = U; --_ >= 0; ) {
        for (h = 0, H = ie[_] % ne, k = ie[_] / ne | 0, N = g, w = _ + N; w > _; )
          x = K[--N] % ne, O = K[N] / ne | 0, S = k * x + O * H, x = H * x + S % ne * ne + $[w] + h, h = (x / Z | 0) + (S / ne | 0) + k * O, $[w--] = x % Z;
        $[w] = h;
      }
      return h ? ++L : $.splice(0, 1), Yt(s, $, L);
    }, B.negated = function() {
      var s = new M(this);
      return s.s = -s.s || null, s;
    }, B.plus = function(s, u) {
      var h, L = this, _ = L.s;
      if (s = new M(s, u), u = s.s, !_ || !u) return new M(NaN);
      if (_ != u)
        return s.s = -u, L.minus(s);
      var w = L.e / a, N = s.e / a, S = L.c, g = s.c;
      if (!w || !N) {
        if (!S || !g) return new M(_ / 0);
        if (!S[0] || !g[0]) return g[0] ? s : new M(S[0] ? L : _ * 0);
      }
      if (w = c(w), N = c(N), S = S.slice(), _ = w - N) {
        for (_ > 0 ? (N = w, h = g) : (_ = -_, h = S), h.reverse(); _--; h.push(0)) ;
        h.reverse();
      }
      for (_ = S.length, u = g.length, _ - u < 0 && (h = g, g = S, S = h, u = _), _ = 0; u; )
        _ = (S[--u] = S[u] + g[u] + _) / o | 0, S[u] = o === S[u] ? 0 : S[u] % o;
      return _ && (S = [_].concat(S), ++N), Yt(s, S, N);
    }, B.precision = B.sd = function(s, u) {
      var h, L, _, w = this;
      if (s != null && s !== !!s)
        return E(s, 1, T), u == null ? u = v : E(u, 0, 8), Ee(new M(w), s, u);
      if (!(h = w.c)) return null;
      if (_ = h.length - 1, L = _ * a + 1, _ = h[_]) {
        for (; _ % 10 == 0; _ /= 10, L--) ;
        for (_ = h[0]; _ >= 10; _ /= 10, L++) ;
      }
      return s && w.e + 1 > L && (L = w.e + 1), L;
    }, B.shiftedBy = function(s) {
      return E(s, -d, d), this.times("1e" + s);
    }, B.squareRoot = B.sqrt = function() {
      var s, u, h, L, _, w = this, N = w.c, S = w.s, g = w.e, x = R + 4, O = new M("0.5");
      if (S !== 1 || !N || !N[0])
        return new M(!S || S < 0 && (!N || N[0]) ? NaN : N ? w : 1 / 0);
      if (S = Math.sqrt(+Ie(w)), S == 0 || S == 1 / 0 ? (u = y(N), (u.length + g) % 2 == 0 && (u += "0"), S = Math.sqrt(+u), g = c((g + 1) / 2) - (g < 0 || g % 2), S == 1 / 0 ? u = "5e" + g : (u = S.toExponential(), u = u.slice(0, u.indexOf("e") + 1) + g), h = new M(u)) : h = new M(S + ""), h.c[0]) {
        for (g = h.e, S = g + x, S < 3 && (S = 0); ; )
          if (_ = h, h = O.times(_.plus(I(w, _, x, 1))), y(_.c).slice(0, S) === (u = y(h.c)).slice(0, S))
            if (h.e < g && --S, u = u.slice(S - 3, S + 1), u == "9999" || !L && u == "4999") {
              if (!L && (Ee(_, _.e + R + 2, 0), _.times(_).eq(w))) {
                h = _;
                break;
              }
              x += 4, S += 4, L = 1;
            } else {
              (!+u || !+u.slice(1) && u.charAt(0) == "5") && (Ee(h, h.e + R + 2, 1), s = !h.times(h).eq(w));
              break;
            }
      }
      return Ee(h, h.e + R + 1, v, s);
    }, B.toExponential = function(s, u) {
      return s != null && (E(s, 0, T), s++), Wt(this, s, u, 1);
    }, B.toFixed = function(s, u) {
      return s != null && (E(s, 0, T), s = s + this.e + 1), Wt(this, s, u);
    }, B.toFormat = function(s, u, h) {
      var L, _ = this;
      if (h == null)
        s != null && u && typeof u == "object" ? (h = u, u = null) : s && typeof s == "object" ? (h = s, s = u = null) : h = Kt;
      else if (typeof h != "object")
        throw Error(t + "Argument not an object: " + h);
      if (L = _.toFixed(s, u), _.c) {
        var w, N = L.split("."), S = +h.groupSize, g = +h.secondaryGroupSize, x = h.groupSeparator || "", O = N[0], U = N[1], H = _.s < 0, k = H ? O.slice(1) : O, $ = k.length;
        if (g && (w = S, S = g, g = w, $ -= w), S > 0 && $ > 0) {
          for (w = $ % S || S, O = k.substr(0, w); w < $; w += S) O += x + k.substr(w, S);
          g > 0 && (O += x + k.slice(w)), H && (O = "-" + O);
        }
        L = U ? O + (h.decimalSeparator || "") + ((g = +h.fractionGroupSize) ? U.replace(
          new RegExp("\\d{" + g + "}\\B", "g"),
          "$&" + (h.fractionGroupSeparator || "")
        ) : U) : O;
      }
      return (h.prefix || "") + L + (h.suffix || "");
    }, B.toFraction = function(s) {
      var u, h, L, _, w, N, S, g, x, O, U, H, k = this, $ = k.c;
      if (s != null && (S = new M(s), !S.isInteger() && (S.c || S.s !== 1) || S.lt(z)))
        throw Error(t + "Argument " + (S.isInteger() ? "out of range: " : "not an integer: ") + Ie(S));
      if (!$) return new M(k);
      for (u = new M(z), x = h = new M(z), L = g = new M(z), H = y($), w = u.e = H.length - k.e - 1, u.c[0] = f[(N = w % a) < 0 ? a + N : N], s = !s || S.comparedTo(u) > 0 ? w > 0 ? u : x : S, N = Q, Q = 1 / 0, S = new M(H), g.c[0] = 0; O = I(S, u, 0, 1), _ = h.plus(O.times(L)), _.comparedTo(s) != 1; )
        h = L, L = _, x = g.plus(O.times(_ = x)), g = _, u = S.minus(O.times(_ = u)), S = _;
      return _ = I(s.minus(h), L, 0, 1), g = g.plus(_.times(x)), h = h.plus(_.times(L)), g.s = x.s = k.s, w = w * 2, U = I(x, L, w, v).minus(k).abs().comparedTo(
        I(g, h, w, v).minus(k).abs()
      ) < 1 ? [x, L] : [g, h], Q = N, U;
    }, B.toNumber = function() {
      return +Ie(this);
    }, B.toObject = function() {
      var s = this;
      return {
        c: s.c ? s.c.slice() : null,
        e: s.e,
        s: s.s
      };
    }, B.toPrecision = function(s, u) {
      return s != null && E(s, 1, T), Wt(this, s, u, 2);
    }, B.toString = function(s) {
      var u, h = this, L = h.s, _ = h.e;
      return _ === null ? L ? (u = "Infinity", L < 0 && (u = "-" + u)) : u = "NaN" : (s == null ? u = _ <= V || _ >= q ? p(y(h.c), _) : D(y(h.c), _, "0") : (E(s, 2, Ce.length, "Base"), u = F(D(y(h.c), _, "0"), 10, s, L, !0)), L < 0 && h.c[0] && (u = "-" + u)), u;
    }, B.valueOf = B.toJSON = function() {
      return Ie(this);
    }, B._isBigNumber = !0, P != null && M.set(P), M;
  }
  function c(P) {
    var I = P | 0;
    return P > 0 || P === I ? I : I - 1;
  }
  function y(P) {
    for (var I, F, C = 1, B = P.length, z = P[0] + ""; C < B; ) {
      for (I = P[C++] + "", F = a - I.length; F--; I = "0" + I) ;
      z += I;
    }
    for (B = z.length; z.charCodeAt(--B) === 48; ) ;
    return z.slice(0, B + 1 || 1);
  }
  function b(P, I) {
    var F, C, B = P.c, z = I.c, R = P.s, v = I.s, V = P.e, q = I.e;
    if (!R || !v) return null;
    if (F = B && !B[0], C = z && !z[0], F || C) return F ? C ? 0 : -v : R;
    if (R != v) return R;
    if (F = R < 0, C = V == q, !B || !z) return C ? 0 : !B ^ F ? 1 : -1;
    if (!C) return V > q ^ F ? 1 : -1;
    for (v = (V = B.length) < (q = z.length) ? V : q, R = 0; R < v; R++) if (B[R] != z[R]) return B[R] > z[R] ^ F ? 1 : -1;
    return V == q ? 0 : V > q ^ F ? 1 : -1;
  }
  function E(P, I, F, C) {
    if (P < I || P > F || P !== r(P))
      throw Error(t + (C || "Argument") + (typeof P == "number" ? P < I || P > F ? " out of range: " : " not an integer: " : " not a primitive number: ") + String(P));
  }
  function l(P) {
    var I = P.c.length - 1;
    return c(P.e / a) == I && P.c[I] % 2 != 0;
  }
  function p(P, I) {
    return (P.length > 1 ? P.charAt(0) + "." + P.slice(1) : P) + (I < 0 ? "e" : "e+") + I;
  }
  function D(P, I, F) {
    var C, B;
    if (I < 0) {
      for (B = F + "."; ++I; B += F) ;
      P = B + P;
    } else if (C = P.length, ++I > C) {
      for (B = F, I -= C; --I; B += F) ;
      P += B;
    } else I < C && (P = P.slice(0, I) + "." + P.slice(I));
    return P;
  }
  return e.default = e.BigNumber = e, on = e, on;
}
var ct = {}, si;
function Sn() {
  if (si) return ct;
  si = 1, Object.defineProperty(ct, "__esModule", { value: !0 }), ct.Hash192 = void 0;
  const e = qt();
  class i extends e.Hash {
    constructor(r) {
      r?.byteLength === 0 && (r = i.ZERO_192.bytes), super(r ?? i.ZERO_192.bytes);
    }
  }
  return ct.Hash192 = i, i.width = 24, i.ZERO_192 = new i(new Uint8Array(i.width)), ct;
}
var ci;
function Ir() {
  if (ci) return ze;
  ci = 1;
  var e = ze && ze.__importDefault || function(P) {
    return P && P.__esModule ? P : { default: P };
  };
  Object.defineProperty(ze, "__esModule", { value: !0 }), ze.Amount = void 0;
  const i = Pe(), n = Nt(), r = Xt(), t = ue(), o = e(mn()), a = te(), d = Se(), f = Sn(), m = -96, T = 80, A = 16, c = new o.default("1e17"), y = new o.default("1e-6"), b = BigInt(4294967295), E = BigInt(9223372036854776e3);
  o.default.config({
    EXPONENTIAL_AT: [
      m - A,
      T + A
    ]
  });
  function l(P) {
    const I = Object.keys(P).sort();
    return I.length === 3 && I[0] === "currency" && I[1] === "issuer" && I[2] === "value";
  }
  function p(P) {
    const I = Object.keys(P).sort();
    return I.length === 2 && I[0] === "mpt_issuance_id" && I[1] === "value";
  }
  class D extends t.SerializedType {
    constructor(I) {
      super(I ?? D.defaultAmount.bytes);
    }
    /**
     * Construct an amount from an IOU, MPT or string amount
     *
     * @param value An Amount, object representing an IOU, or a string
     *     representing an integer amount
     * @returns An Amount object
     */
    static from(I) {
      if (I instanceof D)
        return I;
      let F = new Uint8Array(8);
      if (typeof I == "string") {
        D.assertXrpIsValid(I);
        const C = BigInt(I), B = [new Uint8Array(4), new Uint8Array(4)];
        return (0, d.writeUInt32BE)(B[0], Number(C >> BigInt(32)), 0), (0, d.writeUInt32BE)(B[1], Number(C & BigInt(b)), 0), F = (0, a.concat)(B), F[0] |= 64, new D(F);
      }
      if (l(I)) {
        let C;
        try {
          C = new o.default(I.value);
        } catch {
          throw new Error(`${I.value} is an illegal amount`);
        }
        if (D.assertIouIsValid(C), C.isZero())
          F[0] |= 128;
        else {
          const R = C.times(`1e${-((C.e || 0) - 15)}`).abs().toString(), v = BigInt(R), V = [new Uint8Array(4), new Uint8Array(4)];
          (0, d.writeUInt32BE)(V[0], Number(v >> BigInt(32)), 0), (0, d.writeUInt32BE)(V[1], Number(v & BigInt(b)), 0), F = (0, a.concat)(V), F[0] |= 128, C.gt(new o.default(0)) && (F[0] |= 64);
          const G = 97 + ((C.e || 0) - 15);
          F[0] |= G >>> 2, F[1] |= (G & 3) << 6;
        }
        const B = r.Currency.from(I.currency).toBytes(), z = n.AccountID.from(I.issuer).toBytes();
        return new D((0, a.concat)([F, B, z]));
      }
      if (p(I)) {
        D.assertMptIsValid(I.value);
        let C = new Uint8Array(1);
        C[0] |= 96;
        const B = BigInt(I.value), z = [new Uint8Array(4), new Uint8Array(4)];
        (0, d.writeUInt32BE)(z[0], Number(B >> BigInt(32)), 0), (0, d.writeUInt32BE)(z[1], Number(B & BigInt(b)), 0), F = (0, a.concat)(z);
        const R = f.Hash192.from(I.mpt_issuance_id).toBytes();
        return new D((0, a.concat)([C, F, R]));
      }
      throw new Error("Invalid type to construct an Amount");
    }
    /**
     * Read an amount from a BinaryParser
     *
     * @param parser BinaryParser to read the Amount from
     * @returns An Amount object
     */
    static fromParser(I) {
      if (I.peek() & 128)
        return new D(I.read(48));
      const B = I.peek() & 32 ? 33 : 8;
      return new D(I.read(B));
    }
    /**
     * Get the JSON representation of this Amount
     *
     * @returns the JSON interpretation of this.bytes
     */
    toJSON() {
      if (this.isNative()) {
        const I = this.bytes.slice(), C = I[0] & 64 ? "" : "-";
        I[0] &= 63;
        const B = BigInt((0, d.readUInt32BE)(I.slice(0, 4), 0)), z = BigInt((0, d.readUInt32BE)(I.slice(4), 0)), R = B << BigInt(32) | z;
        return `${C}${R.toString()}`;
      }
      if (this.isIOU()) {
        const I = new i.BinaryParser(this.toString()), F = I.read(8), C = r.Currency.fromParser(I), B = n.AccountID.fromParser(I), z = F[0], R = F[1], V = z & 64 ? "" : "-", q = ((z & 63) << 2) + ((R & 255) >> 6) - 97;
        F[0] = 0, F[1] &= 63;
        const G = new o.default(`${V}0x${(0, a.bytesToHex)(F)}`).times(`1e${q}`);
        return D.assertIouIsValid(G), {
          value: G.toString(),
          currency: C.toJSON(),
          issuer: B.toJSON()
        };
      }
      if (this.isMPT()) {
        const I = new i.BinaryParser(this.toString()), F = I.read(1), C = I.read(8), B = f.Hash192.fromParser(I), R = F[0] & 64 ? "" : "-", v = BigInt((0, d.readUInt32BE)(C.slice(0, 4), 0)), V = BigInt((0, d.readUInt32BE)(C.slice(4), 0)), q = v << BigInt(32) | V;
        return {
          value: `${R}${q.toString()}`,
          mpt_issuance_id: B.toString()
        };
      }
      throw new Error("Invalid amount to construct JSON");
    }
    /**
     * Validate XRP amount
     *
     * @param amount String representing XRP amount
     * @returns void, but will throw if invalid amount
     */
    static assertXrpIsValid(I) {
      if (I.indexOf(".") !== -1)
        throw new Error(`${I.toString()} is an illegal amount`);
      let F;
      try {
        F = new o.default(I);
      } catch {
        throw new Error(`${I.toString()} is an illegal amount`);
      }
      if (!F.isZero() && (F.lt(y) || F.gt(c)))
        throw new Error(`${I.toString()} is an illegal amount`);
    }
    /**
     * Validate IOU.value amount
     *
     * @param decimal BigNumber object representing IOU.value
     * @returns void, but will throw if invalid amount
     */
    static assertIouIsValid(I) {
      if (!I.isZero()) {
        const F = I.precision(), C = (I.e || 0) - 15;
        if (F > A || C > T || C < m)
          throw new Error("Decimal precision out of range");
        this.verifyNoDecimal(I);
      }
    }
    /**
     * Validate MPT.value amount
     *
     * @param decimal BigNumber object representing MPT.value
     * @returns void, but will throw if invalid amount
     */
    static assertMptIsValid(I) {
      if (I.indexOf(".") !== -1)
        throw new Error(`${I.toString()} is an illegal amount`);
      let F;
      try {
        F = new o.default(I);
      } catch {
        throw new Error(`${I.toString()} is an illegal amount`);
      }
      if (!F.isZero()) {
        if (F < (0, o.default)(0))
          throw new Error(`${I.toString()} is an illegal amount`);
        if (Number(BigInt(I) & BigInt(E)) != 0)
          throw new Error(`${I.toString()} is an illegal amount`);
      }
    }
    /**
     * Ensure that the value after being multiplied by the exponent does not
     * contain a decimal.
     *
     * @param decimal a Decimal object
     * @returns a string of the object without a decimal
     */
    static verifyNoDecimal(I) {
      if (I.times(`1e${-((I.e || 0) - 15)}`).abs().toString().indexOf(".") !== -1)
        throw new Error("Decimal place found in integerNumberString");
    }
    /**
     * Test if this amount is in units of Native Currency(XRP)
     *
     * @returns true if Native (XRP)
     */
    isNative() {
      return (this.bytes[0] & 128) === 0 && (this.bytes[0] & 32) === 0;
    }
    /**
     * Test if this amount is in units of MPT
     *
     * @returns true if MPT
     */
    isMPT() {
      return (this.bytes[0] & 128) === 0 && (this.bytes[0] & 32) !== 0;
    }
    /**
     * Test if this amount is in units of IOU
     *
     * @returns true if IOU
     */
    isIOU() {
      return (this.bytes[0] & 128) !== 0;
    }
  }
  return ze.Amount = D, D.defaultAmount = new D((0, a.hexToBytes)("4000000000000000")), ze;
}
var lt = {}, li;
function wa() {
  if (li) return lt;
  li = 1, Object.defineProperty(lt, "__esModule", { value: !0 }), lt.Blob = void 0;
  const e = ue(), i = te();
  class n extends e.SerializedType {
    constructor(t) {
      super(t);
    }
    /**
     * Defines how to read a Blob from a BinaryParser
     *
     * @param parser The binary parser to read the Blob from
     * @param hint The length of the blob, computed by readVariableLengthLength() and passed in
     * @returns A Blob object
     */
    static fromParser(t, o) {
      return new n(t.read(o));
    }
    /**
     * Create a Blob object from a hex-string
     *
     * @param value existing Blob object or a hex-string
     * @returns A Blob object
     */
    static from(t) {
      if (t instanceof n)
        return t;
      if (typeof t == "string") {
        if (!/^[A-F0-9]*$/iu.test(t))
          throw new Error("Cannot construct Blob from a non-hex string");
        return new n((0, i.hexToBytes)(t));
      }
      throw new Error("Cannot construct Blob from value given");
    }
  }
  return lt.Blob = n, lt;
}
var ut = {}, ui;
function La() {
  if (ui) return ut;
  ui = 1, Object.defineProperty(ut, "__esModule", { value: !0 }), ut.Hash128 = void 0;
  const e = qt(), i = te();
  class n extends e.Hash {
    constructor(t) {
      t?.byteLength === 0 && (t = n.ZERO_128.bytes), super(t ?? n.ZERO_128.bytes);
    }
    /**
     * Get the hex representation of a hash-128 bytes, allowing unset
     *
     * @returns hex String of this.bytes
     */
    toHex() {
      const t = (0, i.bytesToHex)(this.toBytes());
      return /^0+$/.exec(t) ? "" : t;
    }
  }
  return ut.Hash128 = n, n.width = 16, n.ZERO_128 = new n(new Uint8Array(n.width)), ut;
}
var dt = {}, di;
function En() {
  if (di) return dt;
  di = 1, Object.defineProperty(dt, "__esModule", { value: !0 }), dt.Hash256 = void 0;
  const e = qt();
  class i extends e.Hash {
    constructor(r) {
      super(r ?? i.ZERO_256.bytes);
    }
  }
  return dt.Hash256 = i, i.width = 32, i.ZERO_256 = new i(new Uint8Array(i.width)), dt;
}
var ft = {}, yt = {}, fi;
function Da() {
  if (fi) return yt;
  fi = 1, Object.defineProperty(yt, "__esModule", { value: !0 }), yt.Int = void 0;
  const e = ue();
  function i(r, t) {
    return r < t ? -1 : r == t ? 0 : 1;
  }
  class n extends e.Comparable {
    constructor(t) {
      super(t);
    }
    /**
     * Overload of compareTo for Comparable
     *
     * @param other other Int to compare this to
     * @returns -1, 0, or 1 depending on how the objects relate to each other
     */
    compareTo(t) {
      return i(this.valueOf(), t.valueOf());
    }
    /**
     * Convert an Int object to JSON
     *
     * @returns number or string represented by this.bytes
     */
    toJSON() {
      const t = this.valueOf();
      return typeof t == "number" ? t : t.toString();
    }
    /**
     * Validate that a number is within the specified signed integer range
     *
     * @param typeName The name of the type (for error messages)
     * @param val The number to validate
     * @param min The minimum allowed value
     * @param max The maximum allowed value
     * @throws Error if the value is out of range
     */
    // eslint-disable-next-line max-params -- for error clarity in browsers
    static checkIntRange(t, o, a, d) {
      if (o < a || o > d)
        throw new Error(`Invalid ${t}: ${o} must be >= ${a} and <= ${d}`);
    }
  }
  return yt.Int = n, yt;
}
var yi;
function Oa() {
  if (yi) return ft;
  yi = 1, Object.defineProperty(ft, "__esModule", { value: !0 }), ft.Int32 = void 0;
  const e = Da(), i = Se();
  class n extends e.Int {
    constructor(t) {
      super(t ?? n.defaultInt32.bytes);
    }
    /**
     * Construct an Int32 from a BinaryParser
     *
     * @param parser BinaryParser to read Int32 from
     * @returns An Int32 object
     */
    static fromParser(t) {
      return new n(t.read(n.width));
    }
    /**
     * Construct an Int32 object from a number or string
     *
     * @param val Int32 object, number, or string
     * @returns An Int32 object
     */
    static from(t) {
      if (t instanceof n)
        return t;
      const o = new Uint8Array(n.width);
      if (typeof t == "string") {
        const a = Number(t);
        if (!Number.isFinite(a) || !Number.isInteger(a))
          throw new Error(`Cannot construct Int32 from string: ${t}`);
        return n.checkIntRange("Int32", a, n.MIN_VALUE, n.MAX_VALUE), (0, i.writeInt32BE)(o, a, 0), new n(o);
      }
      if (typeof t == "number" && Number.isInteger(t))
        return n.checkIntRange("Int32", t, n.MIN_VALUE, n.MAX_VALUE), (0, i.writeInt32BE)(o, t, 0), new n(o);
      throw new Error("Cannot construct Int32 from given value");
    }
    /**
     * Get the value of the Int32 object
     *
     * @returns the signed 32-bit integer represented by this.bytes
     */
    valueOf() {
      return (0, i.readInt32BE)(this.bytes, 0);
    }
  }
  return ft.Int32 = n, n.width = 32 / 8, n.defaultInt32 = new n(new Uint8Array(n.width)), n.MIN_VALUE = -2147483648, n.MAX_VALUE = 2147483647, ft;
}
var ht = {}, hi;
function Tr() {
  if (hi) return ht;
  hi = 1, Object.defineProperty(ht, "__esModule", { value: !0 }), ht.Issue = void 0;
  const e = te(), i = Pe(), n = Nt(), r = Xt(), t = ue(), o = Sn(), a = Se();
  function d(A) {
    const c = Object.keys(A).sort(), y = c.length === 1 && c[0] === "currency", b = c.length === 2 && c[0] === "currency" && c[1] === "issuer", E = c.length === 1 && c[0] === "mpt_issuance_id";
    return y || b || E;
  }
  const f = 44, m = n.AccountID.from("0000000000000000000000000000000000000001");
  class T extends t.SerializedType {
    constructor(c) {
      super(c ?? T.XRP_ISSUE.bytes);
    }
    /**
     * Construct Issue from XRPIssue, IOUIssue or MPTIssue
     *
     * @param value An object representing an XRPIssue, IOUIssue or MPTIssue
     * @returns An Issue object
     */
    static from(c) {
      if (c instanceof T)
        return c;
      if (d(c)) {
        if (c.currency) {
          const y = r.Currency.from(c.currency.toString()).toBytes();
          if (c.issuer) {
            const b = n.AccountID.from(c.issuer.toString()).toBytes();
            return new T((0, e.concat)([y, b]));
          }
          return new T(y);
        }
        if (c.mpt_issuance_id) {
          const y = o.Hash192.from(c.mpt_issuance_id.toString()).toBytes(), b = y.slice(4), E = Number((0, a.readUInt32BE)(y.slice(0, 4), 0)), l = new Uint8Array(4);
          return new DataView(l.buffer).setUint32(0, E, !0), new T((0, e.concat)([b, m.toBytes(), l]));
        }
      }
      throw new Error("Invalid type to construct an Issue");
    }
    /**
     * Read Issue from a BinaryParser
     *
     * @param parser BinaryParser to read the Issue from
     *
     * @returns An Issue object
     */
    static fromParser(c) {
      const y = c.read(20);
      if (new r.Currency(y).toJSON() === "XRP")
        return new T(y);
      const b = new n.AccountID(c.read(20));
      if (m.toHex() === b.toHex()) {
        const E = c.read(4);
        return new T((0, e.concat)([y, m.toBytes(), E]));
      }
      return new T((0, e.concat)([y, b.toBytes()]));
    }
    /**
     * Get the JSON representation of this IssueObject
     *
     * @returns the JSON interpretation of this.bytes
     */
    toJSON() {
      if (this.toBytes().length === f) {
        const E = this.toBytes().slice(0, 20), l = new DataView(this.toBytes().slice(40).buffer).getUint32(0, !0), p = new Uint8Array(4);
        return (0, a.writeUInt32BE)(p, l, 0), {
          mpt_issuance_id: (0, e.bytesToHex)((0, e.concat)([p, E]))
        };
      }
      const c = new i.BinaryParser(this.toString()), y = r.Currency.fromParser(c);
      if (y.toJSON() === "XRP")
        return { currency: y.toJSON() };
      const b = n.AccountID.fromParser(c);
      return {
        currency: y.toJSON(),
        issuer: b.toJSON()
      };
    }
  }
  return ht.Issue = T, T.XRP_ISSUE = new T(new Uint8Array(20)), ht;
}
var pt = {}, pi;
function Fa() {
  if (pi) return pt;
  pi = 1, Object.defineProperty(pt, "__esModule", { value: !0 }), pt.STNumber = void 0;
  const e = ue(), i = Se(), n = BigInt("1000000000000000000"), r = BigInt("9999999999999999999"), t = BigInt("9223372036854775807"), o = -32768, a = 32768, d = -2147483648;
  function f(A) {
    const y = /^([-+]?)([0-9]+)(?:\.([0-9]+))?(?:[eE]([+-]?[0-9]+))?$/.exec(A);
    if (!y)
      throw new Error(`Unable to parse number from string: ${A}`);
    const [, b, E, l, p] = y;
    let P = E.replace(/^0+(?=\d)/, "") || "0", I = 0;
    for (l && (P += l, I -= l.length), p && (I += parseInt(p, 10)); P.length > 1 && P.endsWith("0"); )
      P = P.slice(0, -1), I += 1;
    let F = BigInt(P);
    b === "-" && (F = -F);
    const C = F < BigInt(0);
    return { mantissa: F, exponent: I, isNegative: C };
  }
  function m(A, c) {
    let y = A < BigInt(0) ? -A : A;
    const b = A < BigInt(0);
    if (y === BigInt(0))
      return { mantissa: BigInt(0), exponent: d };
    for (; y < n && c > o; )
      c -= 1, y *= BigInt(10);
    let E = null;
    for (; y > r; ) {
      if (c >= a)
        throw new Error("Mantissa and exponent are too large");
      c += 1, E = y % BigInt(10), y /= BigInt(10);
    }
    if (c < o || y < n)
      throw new Error("Underflow: value too small to represent");
    if (c > a)
      throw new Error("Exponent overflow: value too large to represent");
    if (y > t) {
      if (c >= a)
        throw new Error("Exponent overflow: value too large to represent");
      c += 1, E = y % BigInt(10), y /= BigInt(10);
    }
    if (E != null && E >= BigInt(5) && (y += BigInt(1), y > t)) {
      if (c >= a)
        throw new Error("Exponent overflow: value too large to represent");
      E = y % BigInt(10), c += 1, y /= BigInt(10), E >= BigInt(5) && (y += BigInt(1));
    }
    return b && (y = -y), { mantissa: y, exponent: c };
  }
  class T extends e.SerializedType {
    /**
     * Construct a STNumber from 12 bytes (8 for mantissa, 4 for exponent).
     * @param bytes - 12-byte Uint8Array
     * @throws Error if input is not a Uint8Array of length 12.
     */
    constructor(c) {
      const y = c ?? T.defaultBytes;
      if (!(y instanceof Uint8Array) || y.length !== 12)
        throw new Error(`STNumber must be constructed from a 12-byte Uint8Array, got ${y?.length}`);
      super(y);
    }
    /**
     * Construct from a number string (or another STNumber).
     *
     * @param value - A string, or STNumber instance.
     * @returns STNumber instance.
     * @throws Error if not a string or STNumber.
     */
    static from(c) {
      if (c instanceof T)
        return c;
      if (typeof c == "string")
        return T.fromValue(c);
      throw new Error("STNumber.from: Only string or STNumber instance is supported");
    }
    /**
     * Construct from a number string (integer, decimal, or scientific notation).
     * Handles normalization to XRPL Number constraints.
     *
     * @param val - The number as a string (e.g. '1.23', '-123e5').
     * @returns STNumber instance
     * @throws Error if val is not a valid number string.
     */
    static fromValue(c) {
      const { mantissa: y, exponent: b } = f(c), { mantissa: E, exponent: l } = m(y, b), p = new Uint8Array(12);
      return (0, i.writeInt64BE)(p, E, 0), (0, i.writeInt32BE)(p, l, 8), new T(p);
    }
    /**
     * Read a STNumber from a BinaryParser stream (12 bytes).
     * @param parser - BinaryParser positioned at the start of a number
     * @returns STNumber instance
     */
    static fromParser(c) {
      return new T(c.read(12));
    }
    /**
     * Convert this STNumber to a normalized string representation.
     * The output is decimal or scientific notation, depending on exponent range.
     * Follows XRPL convention: zero is "0", other values are normalized to a canonical string.
     *
     * @returns String representation of the value
     */
    toJSON() {
      const c = this.bytes;
      if (!c || c?.length !== 12)
        throw new Error("STNumber internal bytes not set or wrong length");
      const y = (0, i.readInt64BE)(c, 0);
      let b = (0, i.readInt32BE)(c, 8);
      if (y === BigInt(0) && b === d)
        return "0";
      const E = y < BigInt(0);
      let l = E ? -y : y;
      l !== BigInt(0) && l < n && (l *= BigInt(10), b -= 1);
      const p = 18;
      if (b !== 0 && (b < -28 || b > -8)) {
        let R = b;
        for (; l !== BigInt(0) && l % BigInt(10) === BigInt(0) && R < a; )
          l /= BigInt(10), R += 1;
        return `${E ? "-" : ""}${l}e${R}`;
      }
      const D = p + 12, P = p + 8, I = l.toString(), F = "0".repeat(D) + I + "0".repeat(P), C = b + D + p + 1, B = F.slice(0, C).replace(/^0+/, "") || "0", z = F.slice(C).replace(/0+$/, "");
      return `${E ? "-" : ""}${B}${z ? "." + z : ""}`;
    }
  }
  return pt.STNumber = T, T.defaultBytes = new Uint8Array(12), pt;
}
var gt = {}, gi;
function Na() {
  if (gi) return gt;
  gi = 1, Object.defineProperty(gt, "__esModule", { value: !0 }), gt.PathSet = void 0;
  const e = Nt(), i = Xt(), n = Pe(), r = ue(), t = te(), o = 0, a = 255, d = 1, f = 16, m = 32;
  function T(E) {
    return E.issuer !== void 0 || E.account !== void 0 || E.currency !== void 0;
  }
  function A(E) {
    return Array.isArray(E) && E.length === 0 || Array.isArray(E) && Array.isArray(E[0]) && E[0].length === 0 || Array.isArray(E) && Array.isArray(E[0]) && T(E[0][0]);
  }
  class c extends r.SerializedType {
    /**
     * Create a Hop from a HopObject
     *
     * @param value Either a hop or HopObject to create a hop with
     * @returns a Hop
     */
    static from(l) {
      if (l instanceof c)
        return l;
      const p = [Uint8Array.from([0])];
      return l.account && (p.push(e.AccountID.from(l.account).toBytes()), p[0][0] |= d), l.currency && (p.push(i.Currency.from(l.currency).toBytes()), p[0][0] |= f), l.issuer && (p.push(e.AccountID.from(l.issuer).toBytes()), p[0][0] |= m), new c((0, t.concat)(p));
    }
    /**
     * Construct a Hop from a BinaryParser
     *
     * @param parser BinaryParser to read the Hop from
     * @returns a Hop
     */
    static fromParser(l) {
      const p = l.readUInt8(), D = [Uint8Array.from([p])];
      return p & d && D.push(l.read(e.AccountID.width)), p & f && D.push(l.read(i.Currency.width)), p & m && D.push(l.read(e.AccountID.width)), new c((0, t.concat)(D));
    }
    /**
     * Get the JSON interpretation of this hop
     *
     * @returns a HopObject, an JS object with optional account, issuer, and currency
     */
    toJSON() {
      const l = new n.BinaryParser((0, t.bytesToHex)(this.bytes)), p = l.readUInt8();
      let D, P, I;
      p & d && (D = e.AccountID.fromParser(l).toJSON()), p & f && (P = i.Currency.fromParser(l).toJSON()), p & m && (I = e.AccountID.fromParser(l).toJSON());
      const F = {};
      return D && (F.account = D), I && (F.issuer = I), P && (F.currency = P), F;
    }
    /**
     * get a number representing the type of this hop
     *
     * @returns a number to be bitwise and-ed with TYPE_ constants to describe the types in the hop
     */
    type() {
      return this.bytes[0];
    }
  }
  class y extends r.SerializedType {
    /**
     * construct a Path from an array of Hops
     *
     * @param value Path or array of HopObjects to construct a Path
     * @returns the Path
     */
    static from(l) {
      if (l instanceof y)
        return l;
      const p = [];
      return l.forEach((D) => {
        p.push(c.from(D).toBytes());
      }), new y((0, t.concat)(p));
    }
    /**
     * Read a Path from a BinaryParser
     *
     * @param parser BinaryParser to read Path from
     * @returns the Path represented by the bytes read from the BinaryParser
     */
    static fromParser(l) {
      const p = [];
      for (; !l.end() && (p.push(c.fromParser(l).toBytes()), !(l.peek() === o || l.peek() === a)); )
        ;
      return new y((0, t.concat)(p));
    }
    /**
     * Get the JSON representation of this Path
     *
     * @returns an Array of HopObject constructed from this.bytes
     */
    toJSON() {
      const l = [], p = new n.BinaryParser(this.toString());
      for (; !p.end(); )
        l.push(c.fromParser(p).toJSON());
      return l;
    }
  }
  class b extends r.SerializedType {
    /**
     * Construct a PathSet from an Array of Arrays representing paths
     *
     * @param value A PathSet or Array of Array of HopObjects
     * @returns the PathSet constructed from value
     */
    static from(l) {
      if (l instanceof b)
        return l;
      if (A(l)) {
        const p = [];
        return l.forEach((D) => {
          p.push(y.from(D).toBytes()), p.push(Uint8Array.from([a]));
        }), p[p.length - 1] = Uint8Array.from([o]), new b((0, t.concat)(p));
      }
      throw new Error("Cannot construct PathSet from given value");
    }
    /**
     * Construct a PathSet from a BinaryParser
     *
     * @param parser A BinaryParser to read PathSet from
     * @returns the PathSet read from parser
     */
    static fromParser(l) {
      const p = [];
      for (; !l.end() && (p.push(y.fromParser(l).toBytes()), p.push(l.read(1)), p[p.length - 1][0] != o); )
        ;
      return new b((0, t.concat)(p));
    }
    /**
     * Get the JSON representation of this PathSet
     *
     * @returns an Array of Array of HopObjects, representing this PathSet
     */
    toJSON() {
      const l = [], p = new n.BinaryParser(this.toString());
      for (; !p.end(); )
        l.push(y.fromParser(p).toJSON()), p.skip(1);
      return l;
    }
  }
  return gt.PathSet = b, gt;
}
var mt = {}, St = {}, Et = {}, At = {}, mi;
function $t() {
  if (mi) return At;
  mi = 1, Object.defineProperty(At, "__esModule", { value: !0 }), At.UInt = void 0;
  const e = ue();
  function i(r, t) {
    return r < t ? -1 : r == t ? 0 : 1;
  }
  class n extends e.Comparable {
    constructor(t) {
      super(t);
    }
    /**
     * Overload of compareTo for Comparable
     *
     * @param other other UInt to compare this to
     * @returns -1, 0, or 1 depending on how the objects relate to each other
     */
    compareTo(t) {
      return i(this.valueOf(), t.valueOf());
    }
    /**
     * Convert a UInt object to JSON
     *
     * @returns number or string represented by this.bytes
     */
    toJSON() {
      const t = this.valueOf();
      return typeof t == "number" ? t : t.toString();
    }
    static checkUintRange(t, o, a) {
      if (t < o || t > a)
        throw new Error(`Invalid ${this.constructor.name}: ${t} must be >= ${o} and <= ${a}`);
    }
  }
  return At.UInt = n, At;
}
var Si;
function An() {
  if (Si) return Et;
  Si = 1, Object.defineProperty(Et, "__esModule", { value: !0 }), Et.UInt64 = void 0;
  const e = $t(), i = te(), n = Se(), r = Ne(), t = /^[a-fA-F0-9]{1,16}$/, o = /^[0-9]{1,20}$/, a = BigInt(4294967295), d = /* @__PURE__ */ new Set([
    "MaximumAmount",
    "OutstandingAmount",
    "MPTAmount",
    "LockedAmount",
    "ConfidentialOutstandingAmount"
  ]);
  function f(T) {
    return d.has(T);
  }
  class m extends e.UInt {
    constructor(A) {
      super(A ?? m.defaultUInt64.bytes);
    }
    static fromParser(A) {
      return new m(A.read(m.width));
    }
    /**
     * Construct a UInt64 object
     *
     * @param val A UInt64, hex-string, bigInt, or number
     * @returns A UInt64 object
     */
    // eslint-disable-next-line complexity
    static from(A, c = "") {
      if (A instanceof m)
        return A;
      let y = new Uint8Array(m.width);
      if (typeof A == "number" && Number.isInteger(A)) {
        if (A < 0)
          throw new Error("value must be an unsigned integer");
        const b = BigInt(A), E = [new Uint8Array(4), new Uint8Array(4)];
        return (0, n.writeUInt32BE)(E[0], Number(b >> BigInt(32)), 0), (0, n.writeUInt32BE)(E[1], Number(b & BigInt(a)), 0), new m((0, i.concat)(E));
      }
      if (typeof A == "string") {
        if (f(c)) {
          if (!o.test(A))
            throw new Error(`${c} ${A} is not a valid base 10 string`);
          A = BigInt(A).toString(16);
        }
        if (typeof A == "string" && !t.test(A))
          throw new Error(`${A} is not a valid hex-string`);
        const b = A.padStart(16, "0");
        return y = (0, i.hexToBytes)(b), new m(y);
      }
      if (typeof A == "bigint") {
        const b = [new Uint8Array(4), new Uint8Array(4)];
        return (0, n.writeUInt32BE)(b[0], Number(Number(A >> BigInt(32))), 0), (0, n.writeUInt32BE)(b[1], Number(A & BigInt(a)), 0), new m((0, i.concat)(b));
      }
      throw new Error("Cannot construct UInt64 from given value");
    }
    /**
     * The JSON representation of a UInt64 object
     *
     * @returns a hex-string
     */
    toJSON(A = r.DEFAULT_DEFINITIONS, c = "") {
      const y = (0, i.bytesToHex)(this.bytes);
      return f(c) ? BigInt("0x" + y).toString(10) : y;
    }
    /**
     * Get the value of the UInt64
     *
     * @returns the number represented buy this.bytes
     */
    valueOf() {
      const A = BigInt((0, n.readUInt32BE)(this.bytes.slice(0, 4), 0)), c = BigInt((0, n.readUInt32BE)(this.bytes.slice(4), 0));
      return A << BigInt(32) | c;
    }
    /**
     * Get the bytes representation of the UInt64 object
     *
     * @returns 8 bytes representing the UInt64
     */
    toBytes() {
      return this.bytes;
    }
  }
  return Et.UInt64 = m, m.width = 64 / 8, m.defaultUInt64 = new m(new Uint8Array(m.width)), Et;
}
var Ei;
function In() {
  if (Ei) return St;
  Ei = 1, Object.defineProperty(St, "__esModule", { value: !0 }), St.STObject = void 0;
  const e = Ne(), i = ue(), n = Ar(), r = Pe(), t = Ft(), o = br(), a = An(), d = Uint8Array.from([225]), f = "ObjectEndMarker", m = "STObject", T = "Destination", A = "Account", c = "SourceTag", y = "DestinationTag";
  function b(p, D) {
    const P = (0, n.xAddressToClassicAddress)(D);
    let I;
    if (p === T)
      I = y;
    else if (p === A)
      I = c;
    else if (P.tag !== !1)
      throw new Error(`${p} cannot have an associated tag`);
    return P.tag !== !1 ? { [p]: P.classicAddress, [I]: P.tag } : { [p]: P.classicAddress };
  }
  function E(p, D) {
    if (!(p[c] === void 0 || D[c] === void 0))
      throw new Error("Cannot have Account X-Address and SourceTag");
    if (!(p[y] === void 0 || D[y] === void 0))
      throw new Error("Cannot have Destination X-Address and DestinationTag");
  }
  class l extends i.SerializedType {
    /**
     * Construct a STObject from a BinaryParser
     *
     * @param parser BinaryParser to read STObject from
     * @returns A STObject object
     */
    static fromParser(D) {
      const P = new t.BytesList(), I = new t.BinarySerializer(P);
      for (; !D.end(); ) {
        const F = D.readField();
        if (F.name === f)
          break;
        const C = D.readFieldValue(F);
        I.writeFieldAndValue(F, C), F.type.name === m && I.put(d);
      }
      return new l(P.toBytes());
    }
    /**
     * Construct a STObject from a JSON object
     *
     * @param value An object to include
     * @param filter optional, denote which field to include in serialized object
     * @param definitions optional, types and values to use to encode/decode a transaction
     * @returns a STObject object
     */
    static from(D, P, I = e.DEFAULT_DEFINITIONS) {
      if (D instanceof l)
        return D;
      const F = new t.BytesList(), C = new t.BinarySerializer(F);
      let B = !1;
      const z = Object.entries(D).reduce((V, [q, G]) => {
        let Q;
        return G && (0, n.isValidXAddress)(G.toString()) && (Q = b(q, G.toString()), E(Q, D)), Object.assign(V, Q ?? { [q]: G });
      }, {});
      function R(V) {
        return V !== void 0 && z[V.name] !== void 0 && V.isSerialized;
      }
      let v = Object.keys(z).map((V) => {
        if (!(V in I.field)) {
          if (V[0] === V[0].toLowerCase())
            return;
          throw new Error(`Field ${V} is not defined in the definitions`);
        }
        return I.field[V];
      }).filter(R).sort((V, q) => V.ordinal - q.ordinal);
      return P !== void 0 && (v = v.filter(P)), v.forEach((V) => {
        const q = V.type.name === m ? this.from(z[V.name], void 0, I) : V.type.name === "STArray" ? o.STArray.from(z[V.name], I) : V.type.name === "UInt64" ? a.UInt64.from(z[V.name], V.name) : V.associatedType.from(z[V.name]);
        if (q == null)
          throw new TypeError(`Unable to interpret "${V.name}: ${z[V.name]}".`);
        q.name === "UNLModify" && (B = !0);
        const G = V.name == "Account" && B;
        C.writeFieldAndValue(V, q, G), V.type.name === m && C.put(d);
      }), new l(F.toBytes());
    }
    /**
     * Get the JSON interpretation of this.bytes
     * @param definitions rippled definitions used to parse the values of transaction types and such.
     *                          Can be customized for sidechains and amendments.
     * @returns a JSON object
     */
    toJSON(D) {
      const P = new r.BinaryParser(this.toString(), D), I = {};
      for (; !P.end(); ) {
        const F = P.readField();
        if (F.name === f)
          break;
        I[F.name] = P.readFieldValue(F).toJSON(D, F.name);
      }
      return I;
    }
  }
  return St.STObject = l, St;
}
var Ai;
function br() {
  if (Ai) return mt;
  Ai = 1, Object.defineProperty(mt, "__esModule", { value: !0 }), mt.STArray = void 0;
  const e = Ne(), i = ue(), n = In(), r = Pe(), t = te(), o = Uint8Array.from([241]), a = "ArrayEndMarker", d = Uint8Array.from([225]);
  function f(T) {
    return Array.isArray(T) && T.every((A) => typeof A == "object" && Object.keys(A).length === 1 && typeof Object.values(A)[0] == "object");
  }
  class m extends i.SerializedType {
    /**
     * Construct an STArray from a BinaryParser
     *
     * @param parser BinaryParser to parse an STArray from
     * @returns An STArray Object
     */
    static fromParser(A) {
      const c = [];
      for (; !A.end(); ) {
        const y = A.readField();
        if (y.name === a)
          break;
        c.push(y.header, A.readFieldValue(y).toBytes(), d);
      }
      return c.push(o), new m((0, t.concat)(c));
    }
    /**
     * Construct an STArray from an Array of JSON Objects
     *
     * @param value STArray or Array of Objects to parse into an STArray
     * @param definitions optional, types and values to use to encode/decode a transaction
     * @returns An STArray object
     */
    static from(A, c = e.DEFAULT_DEFINITIONS) {
      if (A instanceof m)
        return A;
      if (f(A)) {
        const y = [];
        return A.forEach((b) => {
          y.push(n.STObject.from(b, void 0, c).toBytes());
        }), y.push(o), new m((0, t.concat)(y));
      }
      throw new Error("Cannot construct STArray from value given");
    }
    /**
     * Return the JSON representation of this.bytes
     *
     * @param definitions optional, types and values to use to encode/decode a transaction
     * @returns An Array of JSON objects
     */
    toJSON(A = e.DEFAULT_DEFINITIONS) {
      const c = [], y = new r.BinaryParser(this.toString(), A);
      for (; !y.end(); ) {
        const b = y.readField();
        if (b.name === a)
          break;
        const E = {};
        E[b.name] = n.STObject.fromParser(y).toJSON(A), c.push(E);
      }
      return c;
    }
  }
  return mt.STArray = m, mt;
}
var ve = {}, Ii;
function Pa() {
  if (Ii) return ve;
  Ii = 1;
  var e = ve && ve.__importDefault || function(m) {
    return m && m.__esModule ? m : { default: m };
  };
  Object.defineProperty(ve, "__esModule", { value: !0 }), ve.SignedAmount = void 0;
  const i = e(mn()), n = te(), r = Se(), t = Ir(), o = new i.default("1e17"), a = new i.default("1e-6"), d = BigInt(4294967295);
  class f extends t.Amount {
    static from(T) {
      if (T instanceof t.Amount)
        return T instanceof f ? T : new f(T.toBytes());
      if (typeof T != "string")
        throw new Error("SignedAmount only supports native XRP string values");
      return f.fromString(T);
    }
    static fromString(T) {
      if (T.indexOf(".") !== -1)
        throw new Error(`${T} is an illegal amount`);
      let A;
      try {
        A = new i.default(T);
      } catch {
        throw new Error(`${T} is an illegal amount`);
      }
      if (A.isNaN())
        throw new Error(`${T} is an illegal amount`);
      if (!A.isZero()) {
        const p = A.abs();
        if (p.lt(a) || p.gt(o))
          throw new Error(`${T} is an illegal amount`);
      }
      let c;
      try {
        c = BigInt(T);
      } catch {
        throw new Error(`${T} is an illegal amount`);
      }
      const y = c < BigInt(0), b = y ? -c : c, E = [new Uint8Array(4), new Uint8Array(4)];
      (0, r.writeUInt32BE)(E[0], Number(b >> BigInt(32)), 0), (0, r.writeUInt32BE)(E[1], Number(b & BigInt(d)), 0);
      const l = (0, n.concat)(E);
      return y || (l[0] |= 64), new f(l);
    }
  }
  return ve.SignedAmount = f, ve;
}
var It = {}, Ti;
function Ca() {
  if (Ti) return It;
  Ti = 1, Object.defineProperty(It, "__esModule", { value: !0 }), It.UInt16 = void 0;
  const e = $t(), i = Se();
  class n extends e.UInt {
    constructor(t) {
      super(t ?? n.defaultUInt16.bytes);
    }
    static fromParser(t) {
      return new n(t.read(n.width));
    }
    /**
     * Construct a UInt16 object from a number
     *
     * @param val UInt16 object or number
     */
    static from(t) {
      if (t instanceof n)
        return t;
      if (typeof t == "number" && Number.isInteger(t)) {
        n.checkUintRange(t, 0, 65535);
        const o = new Uint8Array(n.width);
        return (0, i.writeUInt16BE)(o, t, 0), new n(o);
      }
      throw new Error("Cannot construct UInt16 from given value");
    }
    /**
     * get the value of a UInt16 object
     *
     * @returns the number represented by this.bytes
     */
    valueOf() {
      return parseInt((0, i.readUInt16BE)(this.bytes, 0));
    }
  }
  return It.UInt16 = n, n.width = 16 / 8, n.defaultUInt16 = new n(new Uint8Array(n.width)), It;
}
var Tt = {}, bi;
function _r() {
  if (bi) return Tt;
  bi = 1, Object.defineProperty(Tt, "__esModule", { value: !0 }), Tt.UInt32 = void 0;
  const e = $t(), i = Se();
  class n extends e.UInt {
    constructor(t) {
      super(t ?? n.defaultUInt32.bytes);
    }
    static fromParser(t) {
      return new n(t.read(n.width));
    }
    /**
     * Construct a UInt32 object from a number
     *
     * @param val UInt32 object or number
     */
    static from(t) {
      if (t instanceof n)
        return t;
      const o = new Uint8Array(n.width);
      if (typeof t == "string") {
        const a = Number.parseInt(t);
        return (0, i.writeUInt32BE)(o, a, 0), new n(o);
      }
      if (typeof t == "number" && Number.isInteger(t))
        return n.checkUintRange(t, 0, 4294967295), (0, i.writeUInt32BE)(o, t, 0), new n(o);
      throw new Error("Cannot construct UInt32 from given value");
    }
    /**
     * get the value of a UInt32 object
     *
     * @returns the number represented by this.bytes
     */
    valueOf() {
      return parseInt((0, i.readUInt32BE)(this.bytes, 0), 10);
    }
  }
  return Tt.UInt32 = n, n.width = 32 / 8, n.defaultUInt32 = new n(new Uint8Array(n.width)), Tt;
}
var bt = {}, _i;
function wr() {
  if (_i) return bt;
  _i = 1, Object.defineProperty(bt, "__esModule", { value: !0 }), bt.UInt8 = void 0;
  const e = $t(), i = te(), n = Se();
  class r extends e.UInt {
    constructor(o) {
      super(o ?? r.defaultUInt8.bytes);
    }
    static fromParser(o) {
      return new r(o.read(r.width));
    }
    /**
     * Construct a UInt8 object from a number
     *
     * @param val UInt8 object or number
     */
    static from(o) {
      if (o instanceof r)
        return o;
      if (typeof o == "number" && Number.isInteger(o)) {
        r.checkUintRange(o, 0, 255);
        const a = new Uint8Array(r.width);
        return (0, n.writeUInt8)(a, o, 0), new r(a);
      }
      throw new Error("Cannot construct UInt8 from given value");
    }
    /**
     * get the value of a UInt8 object
     *
     * @returns the number represented by this.bytes
     */
    valueOf() {
      return parseInt((0, i.bytesToHex)(this.bytes), 16);
    }
  }
  return bt.UInt8 = r, r.width = 8 / 8, r.defaultUInt8 = new r(new Uint8Array(r.width)), bt;
}
var _t = {}, wi;
function Ba() {
  if (wi) return _t;
  wi = 1, Object.defineProperty(_t, "__esModule", { value: !0 }), _t.Vector256 = void 0;
  const e = ue(), i = En(), n = Ft(), r = te();
  function t(a) {
    return Array.isArray(a) && (a.length === 0 || typeof a[0] == "string");
  }
  class o extends e.SerializedType {
    constructor(d) {
      super(d);
    }
    /**
     * Construct a Vector256 from a BinaryParser
     *
     * @param parser BinaryParser to
     * @param hint length of the vector, in bytes, optional
     * @returns a Vector256 object
     */
    static fromParser(d, f) {
      const m = new n.BytesList(), A = (f ?? d.size()) / 32;
      for (let c = 0; c < A; c++)
        i.Hash256.fromParser(d).toBytesSink(m);
      return new o(m.toBytes());
    }
    /**
     * Construct a Vector256 object from an array of hashes
     *
     * @param value A Vector256 object or array of hex-strings representing Hash256's
     * @returns a Vector256 object
     */
    static from(d) {
      if (d instanceof o)
        return d;
      if (t(d)) {
        const f = new n.BytesList();
        return d.forEach((m) => {
          i.Hash256.from(m).toBytesSink(f);
        }), new o(f.toBytes());
      }
      throw new Error("Cannot construct Vector256 from given value");
    }
    /**
     * Return an Array of hex-strings represented by this.bytes
     *
     * @returns An Array of strings representing the Hash256 objects
     */
    toJSON() {
      if (this.bytes.byteLength % 32 !== 0)
        throw new Error("Invalid bytes for Vector256");
      const d = [];
      for (let f = 0; f < this.bytes.byteLength; f += 32)
        d.push((0, r.bytesToHex)(this.bytes.slice(f, f + 32)));
      return d;
    }
  }
  return _t.Vector256 = o, _t;
}
var wt = {}, Li;
function xa() {
  if (Li) return wt;
  Li = 1, Object.defineProperty(wt, "__esModule", { value: !0 }), wt.XChainBridge = void 0;
  const e = Pe(), i = Nt(), n = ue(), r = Tr(), t = te();
  function o(d) {
    const f = Object.keys(d).sort();
    return f.length === 4 && f[0] === "IssuingChainDoor" && f[1] === "IssuingChainIssue" && f[2] === "LockingChainDoor" && f[3] === "LockingChainIssue";
  }
  class a extends n.SerializedType {
    constructor(f) {
      super(f ?? a.ZERO_XCHAIN_BRIDGE.bytes);
    }
    /**
     * Construct a cross-chain bridge from a JSON
     *
     * @param value XChainBridge or JSON to parse into an XChainBridge
     * @returns An XChainBridge object
     */
    static from(f) {
      if (f instanceof a)
        return f;
      if (!o(f))
        throw new Error("Invalid type to construct an XChainBridge");
      const m = [];
      return this.TYPE_ORDER.forEach((T) => {
        const { name: A, type: c } = T;
        c === i.AccountID && m.push(Uint8Array.from([20]));
        const y = c.from(f[A]);
        m.push(y.toBytes());
      }), new a((0, t.concat)(m));
    }
    /**
     * Read an XChainBridge from a BinaryParser
     *
     * @param parser BinaryParser to read the XChainBridge from
     * @returns An XChainBridge object
     */
    static fromParser(f) {
      const m = [];
      return this.TYPE_ORDER.forEach((T) => {
        const { type: A } = T;
        A === i.AccountID && (f.skip(1), m.push(Uint8Array.from([20])));
        const c = A.fromParser(f);
        m.push(c.toBytes());
      }), new a((0, t.concat)(m));
    }
    /**
     * Get the JSON representation of this XChainBridge
     *
     * @returns the JSON interpretation of this.bytes
     */
    toJSON() {
      const f = new e.BinaryParser(this.toString()), m = {};
      return a.TYPE_ORDER.forEach((T) => {
        const { name: A, type: c } = T;
        c === i.AccountID && f.skip(1);
        const y = c.fromParser(f).toJSON();
        m[A] = y;
      }), m;
    }
  }
  return wt.XChainBridge = a, a.ZERO_XCHAIN_BRIDGE = new a((0, t.concat)([
    Uint8Array.from([20]),
    new Uint8Array(40),
    Uint8Array.from([20]),
    new Uint8Array(40)
  ])), a.TYPE_ORDER = [
    { name: "LockingChainDoor", type: i.AccountID },
    { name: "LockingChainIssue", type: r.Issue },
    { name: "IssuingChainDoor", type: i.AccountID },
    { name: "IssuingChainIssue", type: r.Issue }
  ], wt;
}
var Di;
function Ge() {
  return Di || (Di = 1, (function(e) {
    Object.defineProperty(e, "__esModule", { value: !0 }), e.Vector256 = e.UInt64 = e.UInt32 = e.UInt16 = e.UInt8 = e.STObject = e.STArray = e.SignedAmount = e.PathSet = e.Int32 = e.Hash256 = e.Hash192 = e.Hash160 = e.Hash128 = e.Currency = e.Blob = e.Amount = e.AccountID = e.coreTypes = void 0;
    const i = Nt();
    Object.defineProperty(e, "AccountID", { enumerable: !0, get: function() {
      return i.AccountID;
    } });
    const n = Ir();
    Object.defineProperty(e, "Amount", { enumerable: !0, get: function() {
      return n.Amount;
    } });
    const r = wa();
    Object.defineProperty(e, "Blob", { enumerable: !0, get: function() {
      return r.Blob;
    } });
    const t = Xt();
    Object.defineProperty(e, "Currency", { enumerable: !0, get: function() {
      return t.Currency;
    } });
    const o = La();
    Object.defineProperty(e, "Hash128", { enumerable: !0, get: function() {
      return o.Hash128;
    } });
    const a = gn();
    Object.defineProperty(e, "Hash160", { enumerable: !0, get: function() {
      return a.Hash160;
    } });
    const d = Sn();
    Object.defineProperty(e, "Hash192", { enumerable: !0, get: function() {
      return d.Hash192;
    } });
    const f = En();
    Object.defineProperty(e, "Hash256", { enumerable: !0, get: function() {
      return f.Hash256;
    } });
    const m = Oa();
    Object.defineProperty(e, "Int32", { enumerable: !0, get: function() {
      return m.Int32;
    } });
    const T = Tr(), A = Fa(), c = Na();
    Object.defineProperty(e, "PathSet", { enumerable: !0, get: function() {
      return c.PathSet;
    } });
    const y = br();
    Object.defineProperty(e, "STArray", { enumerable: !0, get: function() {
      return y.STArray;
    } });
    const b = Pa();
    Object.defineProperty(e, "SignedAmount", { enumerable: !0, get: function() {
      return b.SignedAmount;
    } });
    const E = In();
    Object.defineProperty(e, "STObject", { enumerable: !0, get: function() {
      return E.STObject;
    } });
    const l = Ca();
    Object.defineProperty(e, "UInt16", { enumerable: !0, get: function() {
      return l.UInt16;
    } });
    const p = _r();
    Object.defineProperty(e, "UInt32", { enumerable: !0, get: function() {
      return p.UInt32;
    } });
    const D = An();
    Object.defineProperty(e, "UInt64", { enumerable: !0, get: function() {
      return D.UInt64;
    } });
    const P = wr();
    Object.defineProperty(e, "UInt8", { enumerable: !0, get: function() {
      return P.UInt8;
    } });
    const I = Ba();
    Object.defineProperty(e, "Vector256", { enumerable: !0, get: function() {
      return I.Vector256;
    } });
    const F = xa(), C = Ne(), B = {
      AccountID: i.AccountID,
      Amount: n.Amount,
      Blob: r.Blob,
      Currency: t.Currency,
      Hash128: o.Hash128,
      Hash160: a.Hash160,
      Hash192: d.Hash192,
      Hash256: f.Hash256,
      Int32: m.Int32,
      Issue: T.Issue,
      Number: A.STNumber,
      PathSet: c.PathSet,
      SignedAmount: b.SignedAmount,
      STArray: y.STArray,
      STObject: E.STObject,
      UInt8: P.UInt8,
      UInt16: l.UInt16,
      UInt32: p.UInt32,
      UInt64: D.UInt64,
      Vector256: I.Vector256,
      XChainBridge: F.XChainBridge
    };
    e.coreTypes = B, C.DEFAULT_DEFINITIONS.associateTypes(B);
  })(tn)), tn;
}
var an = {}, Lt = {}, Oi;
function Pt() {
  if (Oi) return Lt;
  Oi = 1, Object.defineProperty(Lt, "__esModule", { value: !0 }), Lt.HashPrefix = void 0;
  const e = Se();
  function i(r) {
    const t = new Uint8Array(4);
    return (0, e.writeUInt32BE)(t, r, 0), t;
  }
  const n = {
    transactionID: i(1415073280),
    // transaction plus metadata
    transaction: i(1397638144),
    // account state
    accountStateEntry: i(1296846336),
    // inner node in tree
    innerNode: i(1296649728),
    // ledger master data for signing
    ledgerHeader: i(1280791040),
    // inner transaction to sign
    transactionSig: i(1398036480),
    // inner transaction to sign
    transactionMultiSig: i(1397576704),
    // inner transaction to sign as the counterparty (fixCleanup3_4_0)
    counterpartyTransactionSig: i(1129337856),
    // inner transaction to multi-sign as the counterparty (fixCleanup3_4_0)
    counterpartyTransactionMultiSig: i(1129336064),
    // inner transaction to sign as the sponsor (fixCleanup3_4_0)
    sponsorTransactionSig: i(1397771776),
    // inner transaction to multi-sign as the sponsor (fixCleanup3_4_0)
    sponsorTransactionMultiSig: i(1397771520),
    // validation for signing
    validation: i(1447119872),
    // proposal for signing
    proposal: i(1347571712),
    // payment channel claim
    paymentChannelClaim: i(1129073920),
    // batch
    batch: i(1111705600)
  };
  return Lt.HashPrefix = n, Lt;
}
var we = {}, He = {}, Fi;
function Ua() {
  if (Fi) return He;
  Fi = 1;
  var e = He && He.__importDefault || function(r) {
    return r && r.__esModule ? r : { default: r };
  };
  Object.defineProperty(He, "__esModule", { value: !0 }), He.sha512 = void 0;
  const i = Sr, n = e(Er());
  return He.sha512 = (0, n.default)(i.sha512), He;
}
var Ni;
function Gt() {
  if (Ni) return we;
  Ni = 1, Object.defineProperty(we, "__esModule", { value: !0 }), we.transactionID = we.sha512Half = we.Sha512Half = void 0;
  const e = Pt(), i = Ge(), n = Ft(), r = Ua();
  class t extends n.BytesList {
    constructor() {
      super(...arguments), this.hash = r.sha512.create();
    }
    /**
     * Construct a new Sha512Hash and write bytes this.hash
     *
     * @param bytes bytes to write to this.hash
     * @returns the new Sha512Hash object
     */
    static put(f) {
      return new t().put(f);
    }
    /**
     * Write bytes to an existing Sha512Hash
     *
     * @param bytes bytes to write to object
     * @returns the Sha512 object
     */
    put(f) {
      return this.hash.update(f), this;
    }
    /**
     * Compute SHA512 hash and slice in half
     *
     * @returns half of a SHA512 hash
     */
    finish256() {
      return Uint8Array.from(this.hash.digest().slice(0, 32));
    }
    /**
     * Constructs a Hash256 from the Sha512Half object
     *
     * @returns a Hash256 object
     */
    finish() {
      return new i.Hash256(this.finish256());
    }
  }
  we.Sha512Half = t;
  function o(...d) {
    const f = new t();
    return d.forEach((m) => f.put(m)), f.finish256();
  }
  we.sha512Half = o;
  function a(d) {
    return new i.Hash256(o(e.HashPrefix.transactionID, d));
  }
  return we.transactionID = a, we;
}
var Pi;
function Lr() {
  return Pi || (Pi = 1, (function(e) {
    Object.defineProperty(e, "__esModule", { value: !0 }), e.signingBatchData = e.transactionID = e.sha512Half = e.binaryToJSON = e.signingClaimData = e.signingData = e.multiSigningData = e.readJSON = e.serializeObject = e.makeParser = e.BytesList = e.BinarySerializer = e.BinaryParser = void 0;
    const i = te(), n = Ge(), r = Pe();
    Object.defineProperty(e, "BinaryParser", { enumerable: !0, get: function() {
      return r.BinaryParser;
    } });
    const t = Pt(), o = Ft();
    Object.defineProperty(e, "BinarySerializer", { enumerable: !0, get: function() {
      return o.BinarySerializer;
    } }), Object.defineProperty(e, "BytesList", { enumerable: !0, get: function() {
      return o.BytesList;
    } });
    const a = Gt();
    Object.defineProperty(e, "sha512Half", { enumerable: !0, get: function() {
      return a.sha512Half;
    } }), Object.defineProperty(e, "transactionID", { enumerable: !0, get: function() {
      return a.transactionID;
    } });
    const d = Ne(), f = (l, p) => new r.BinaryParser(l instanceof Uint8Array ? (0, i.bytesToHex)(l) : l, p);
    e.makeParser = f;
    const m = (l, p = d.DEFAULT_DEFINITIONS) => l.readType(n.coreTypes.STObject).toJSON(p);
    e.readJSON = m;
    const T = (l, p) => m(f(l, p), p);
    e.binaryToJSON = T;
    function A(l, p = {}) {
      const { prefix: D, suffix: P, signingFieldsOnly: I = !1, definitions: F } = p, C = new o.BytesList();
      D && C.put(D);
      const B = I ? (z) => z.isSigningField : void 0;
      return n.coreTypes.STObject.from(l, B, F).toBytesSink(C), P && C.put(P), C.toBytes();
    }
    e.serializeObject = A;
    function c(l, p = t.HashPrefix.transactionSig, D = {}) {
      return A(l, {
        prefix: p,
        signingFieldsOnly: !0,
        definitions: D.definitions
      });
    }
    e.signingData = c;
    function y(l) {
      const p = BigInt(String(l.amount)), D = t.HashPrefix.paymentChannelClaim, P = n.coreTypes.Hash256.from(l.channel).toBytes(), I = n.coreTypes.UInt64.from(p).toBytes(), F = new o.BytesList();
      return F.put(D), F.put(P), F.put(I), F.toBytes();
    }
    e.signingClaimData = y;
    function b(l, p, D = {}) {
      var P, I;
      const F = (P = D.prefix) !== null && P !== void 0 ? P : t.HashPrefix.transactionMultiSig, C = n.coreTypes.AccountID.from(p).toBytes();
      return A(l, {
        prefix: F,
        suffix: C,
        signingFieldsOnly: !0,
        definitions: (I = D.definitions) !== null && I !== void 0 ? I : d.DEFAULT_DEFINITIONS
      });
    }
    e.multiSigningData = b;
    function E(l) {
      if (l.account == null)
        throw Error("No field `account`");
      if (l.sequence == null)
        throw Error("No field `sequence`");
      if (l.flags == null)
        throw Error("No field `flags`");
      if (l.txIDs == null)
        throw Error("No field `txIDs`");
      const p = t.HashPrefix.batch, D = n.coreTypes.AccountID.from(l.account).toBytes(), P = n.coreTypes.UInt32.from(l.sequence).toBytes(), I = n.coreTypes.UInt32.from(l.flags).toBytes(), F = n.coreTypes.UInt32.from(l.txIDs.length).toBytes(), C = new o.BytesList();
      if (C.put(p), C.put(D), C.put(P), C.put(I), C.put(F), l.txIDs.forEach((B) => {
        C.put(n.coreTypes.Hash256.from(B).toBytes());
      }), l.batchAccount != null && C.put(n.coreTypes.AccountID.from(l.batchAccount).toBytes()), l.signerAccount != null) {
        if (l.batchAccount == null)
          throw Error("Field `signerAccount` requires `batchAccount`");
        C.put(n.coreTypes.AccountID.from(l.signerAccount).toBytes());
      }
      return C.toBytes();
    }
    e.signingBatchData = E;
  })(an)), an;
}
var Le = {}, Ci;
function Dr() {
  if (Ci) return Le;
  Ci = 1, Object.defineProperty(Le, "__esModule", { value: !0 }), Le.ShaMapLeaf = Le.ShaMapNode = Le.ShaMap = void 0;
  const e = Ge(), i = Pt(), n = Gt();
  class r {
  }
  Le.ShaMapNode = r;
  class t extends r {
    constructor(f, m) {
      super(), this.index = f, this.item = m;
    }
    /**
     * @returns true as ShaMapLeaf is a leaf node
     */
    isLeaf() {
      return !0;
    }
    /**
     * @returns false as ShaMapLeaf is not an inner node
     */
    isInner() {
      return !1;
    }
    /**
     * Get the prefix of the this.item
     *
     * @returns The hash prefix, unless this.item is undefined, then it returns an empty Uint8Array
     */
    hashPrefix() {
      return this.item === void 0 ? new Uint8Array(0) : this.item.hashPrefix();
    }
    /**
     * Hash the bytes representation of this
     *
     * @returns hash of this.item concatenated with this.index
     */
    hash() {
      const f = n.Sha512Half.put(this.hashPrefix());
      return this.toBytesSink(f), f.finish();
    }
    /**
     * Write the bytes representation of this to a BytesList
     * @param list BytesList to write bytes to
     */
    toBytesSink(f) {
      this.item !== void 0 && this.item.toBytesSink(f), this.index.toBytesSink(f);
    }
  }
  Le.ShaMapLeaf = t;
  class o extends r {
    constructor(f = 0) {
      super(), this.depth = f, this.slotBits = 0, this.branches = Array(16);
    }
    /**
     * @returns true as ShaMapInner is an inner node
     */
    isInner() {
      return !0;
    }
    /**
     * @returns false as ShaMapInner is not a leaf node
     */
    isLeaf() {
      return !1;
    }
    /**
     * Get the hash prefix for this node
     *
     * @returns hash prefix describing an inner node
     */
    hashPrefix() {
      return i.HashPrefix.innerNode;
    }
    /**
     * Set a branch of this node to be another node
     *
     * @param slot Slot to add branch to this.branches
     * @param branch Branch to add
     */
    setBranch(f, m) {
      this.slotBits = this.slotBits | 1 << f, this.branches[f] = m;
    }
    /**
     * @returns true if node is empty
     */
    empty() {
      return this.slotBits === 0;
    }
    /**
     * Compute the hash of this node
     *
     * @returns The hash of this node
     */
    hash() {
      if (this.empty())
        return e.coreTypes.Hash256.ZERO_256;
      const f = n.Sha512Half.put(this.hashPrefix());
      return this.toBytesSink(f), f.finish();
    }
    /**
     * Writes the bytes representation of this node to a BytesList
     *
     * @param list BytesList to write bytes to
     */
    toBytesSink(f) {
      for (let m = 0; m < this.branches.length; m++) {
        const T = this.branches[m];
        (T ? T.hash() : e.coreTypes.Hash256.ZERO_256).toBytesSink(f);
      }
    }
    /**
     * Add item to the SHAMap
     *
     * @param index Hash of the index of the item being inserted
     * @param item Item to insert in the map
     * @param leaf Leaf node to insert when branch doesn't exist
     */
    addItem(f, m, T) {
      if (f === void 0)
        throw new Error();
      if (f !== void 0) {
        const A = f.nibblet(this.depth), c = this.branches[A];
        if (c === void 0)
          this.setBranch(A, T || new t(f, m));
        else if (c instanceof t) {
          const y = new o(this.depth + 1);
          y.addItem(c.index, void 0, c), y.addItem(f, m, T), this.setBranch(A, y);
        } else if (c instanceof o)
          c.addItem(f, m, T);
        else
          throw new Error("invalid ShaMap.addItem call");
      }
    }
  }
  class a extends o {
  }
  return Le.ShaMap = a, Le;
}
var ge = {}, Bi;
function Or() {
  if (Bi) return ge;
  Bi = 1, Object.defineProperty(ge, "__esModule", { value: !0 }), ge.decodeLedgerData = ge.ledgerHash = ge.transactionTreeHash = ge.accountStateHash = void 0;
  const e = Dr(), i = Pt(), n = Gt(), r = Lr(), t = En(), o = In(), a = An(), d = _r(), f = wr(), m = Pe();
  function T(p, D) {
    const P = new e.ShaMap();
    return D.forEach((I) => P.addItem(...p(I))), P.hash();
  }
  function A(p) {
    if (!p.hash)
      throw new Error();
    return [t.Hash256.from(p.hash), {
      hashPrefix() {
        return i.HashPrefix.transaction;
      },
      toBytesSink(I) {
        const F = new r.BinarySerializer(I);
        F.writeLengthEncoded(o.STObject.from(p)), F.writeLengthEncoded(o.STObject.from(p.metaData));
      }
    }, void 0];
  }
  function c(p) {
    const D = t.Hash256.from(p.index), P = (0, r.serializeObject)(p);
    return [D, {
      hashPrefix() {
        return i.HashPrefix.accountStateEntry;
      },
      toBytesSink(F) {
        F.put(P);
      }
    }, void 0];
  }
  function y(p) {
    return T(A, p);
  }
  ge.transactionTreeHash = y;
  function b(p) {
    return T(c, p);
  }
  ge.accountStateHash = b;
  function E(p) {
    const D = new n.Sha512Half();
    if (D.put(i.HashPrefix.ledgerHeader), p.parent_close_time === void 0 || p.close_flags === void 0)
      throw new Error();
    return d.UInt32.from(p.ledger_index).toBytesSink(D), a.UInt64.from(BigInt(String(p.total_coins))).toBytesSink(D), t.Hash256.from(p.parent_hash).toBytesSink(D), t.Hash256.from(p.transaction_hash).toBytesSink(D), t.Hash256.from(p.account_hash).toBytesSink(D), d.UInt32.from(p.parent_close_time).toBytesSink(D), d.UInt32.from(p.close_time).toBytesSink(D), f.UInt8.from(p.close_time_resolution).toBytesSink(D), f.UInt8.from(p.close_flags).toBytesSink(D), D.finish();
  }
  ge.ledgerHash = E;
  function l(p, D) {
    if (typeof p != "string")
      throw new Error("binary must be a hex string");
    const P = new m.BinaryParser(p, D);
    return {
      ledger_index: P.readUInt32(),
      total_coins: P.readType(a.UInt64).valueOf().toString(),
      parent_hash: P.readType(t.Hash256).toHex(),
      transaction_hash: P.readType(t.Hash256).toHex(),
      account_hash: P.readType(t.Hash256).toHex(),
      parent_close_time: P.readUInt32(),
      close_time: P.readUInt32(),
      close_time_resolution: P.readUInt8(),
      close_flags: P.readUInt8()
    };
  }
  return ge.decodeLedgerData = l, ge;
}
var ke = {}, xi;
function Ra() {
  if (xi) return ke;
  xi = 1;
  var e = ke && ke.__importDefault || function(o) {
    return o && o.__esModule ? o : { default: o };
  };
  Object.defineProperty(ke, "__esModule", { value: !0 }), ke.quality = void 0;
  const i = Ge(), n = e(mn()), r = te();
  let t = class {
    /**
     * Encode quality amount
     *
     * @param arg string representation of an amount
     * @returns Serialized quality
     */
    static encode(a) {
      let d;
      try {
        d = new n.default(a);
      } catch {
        throw new Error(`${a} is not a valid quality`);
      }
      const f = (d.e || 0) - 15, m = d.times(`1e${-f}`).abs().toString(), T = i.coreTypes.UInt64.from(BigInt(m)).toBytes();
      return T[0] = f + 100, T;
    }
    /**
     * Decode quality amount
     *
     * @param arg hex-string denoting serialized quality
     * @returns deserialized quality
     */
    static decode(a) {
      const d = (0, r.hexToBytes)(a).slice(-8), f = d[0] - 100;
      let m;
      try {
        m = new n.default(`0x${(0, r.bytesToHex)(d.slice(1))}`);
      } catch {
        throw new Error(`${a} is not a valid quality`);
      }
      return m.times(`1e${f}`);
    }
  };
  return ke.quality = t, ke;
}
var Ui;
function Ma() {
  return Ui || (Ui = 1, (function(e) {
    var i = Te && Te.__createBinding || (Object.create ? (function(c, y, b, E) {
      E === void 0 && (E = b);
      var l = Object.getOwnPropertyDescriptor(y, b);
      (!l || ("get" in l ? !y.__esModule : l.writable || l.configurable)) && (l = { enumerable: !0, get: function() {
        return y[b];
      } }), Object.defineProperty(c, E, l);
    }) : (function(c, y, b, E) {
      E === void 0 && (E = b), c[E] = y[b];
    })), n = Te && Te.__setModuleDefault || (Object.create ? (function(c, y) {
      Object.defineProperty(c, "default", { enumerable: !0, value: y });
    }) : function(c, y) {
      c.default = y;
    }), r = Te && Te.__importStar || function(c) {
      if (c && c.__esModule) return c;
      var y = {};
      if (c != null) for (var b in c) b !== "default" && Object.prototype.hasOwnProperty.call(c, b) && i(y, c, b);
      return n(y, c), y;
    };
    Object.defineProperty(e, "__esModule", { value: !0 }), e.types = e.ShaMap = e.HashPrefix = e.quality = e.TransactionResult = e.Type = e.LedgerEntryType = e.TransactionType = e.Field = e.DEFAULT_DEFINITIONS = e.ledgerHashes = e.binary = e.hashes = void 0;
    const t = Ne();
    Object.defineProperty(e, "DEFAULT_DEFINITIONS", { enumerable: !0, get: function() {
      return t.DEFAULT_DEFINITIONS;
    } }), Object.defineProperty(e, "Field", { enumerable: !0, get: function() {
      return t.Field;
    } }), Object.defineProperty(e, "TransactionType", { enumerable: !0, get: function() {
      return t.TransactionType;
    } }), Object.defineProperty(e, "LedgerEntryType", { enumerable: !0, get: function() {
      return t.LedgerEntryType;
    } }), Object.defineProperty(e, "Type", { enumerable: !0, get: function() {
      return t.Type;
    } }), Object.defineProperty(e, "TransactionResult", { enumerable: !0, get: function() {
      return t.TransactionResult;
    } });
    const o = r(Ge());
    e.types = o;
    const a = r(Lr());
    e.binary = a;
    const d = Dr();
    Object.defineProperty(e, "ShaMap", { enumerable: !0, get: function() {
      return d.ShaMap;
    } });
    const f = r(Or());
    e.ledgerHashes = f;
    const m = r(Gt());
    e.hashes = m;
    const T = Ra();
    Object.defineProperty(e, "quality", { enumerable: !0, get: function() {
      return T.quality;
    } });
    const A = Pt();
    Object.defineProperty(e, "HashPrefix", { enumerable: !0, get: function() {
      return A.HashPrefix;
    } });
  })(Te)), Te;
}
var Dt = {}, Ri;
function Va() {
  if (Ri) return Dt;
  Ri = 1, Object.defineProperty(Dt, "__esModule", { value: !0 }), Dt.XrplDefinitions = void 0;
  const e = $i(), i = Ge();
  class n extends e.XrplDefinitionsBase {
    /**
     * Present rippled types in a typed and updatable format.
     * For an example of the input format see `definitions.json`
     * To generate a new definitions file from rippled source code, use the tool at
     * `packages/ripple-binary-codec/tools/generateDefinitions.js`.
     *
     * See the definitions.test.js file for examples of how to create your own updated definitions.json.
     *
     * @param enums - A json encoding of the core types, transaction types, transaction results, transaction names, and fields.
     * @param additionalTypes - A list of SerializedType objects with the same name as the fields defined.
     *              These types will be included in addition to the coreTypes used on mainnet.
     */
    constructor(t, o) {
      const a = Object.assign({}, i.coreTypes, o);
      super(t, a);
    }
  }
  return Dt.XrplDefinitions = n, Dt;
}
var Mi;
function za() {
  return Mi || (Mi = 1, (function(e) {
    Object.defineProperty(e, "__esModule", { value: !0 }), e.coreTypes = e.DEFAULT_DEFINITIONS = e.XrplDefinitionsBase = e.XrplDefinitions = e.TRANSACTION_TYPES = e.decodeLedgerData = e.decodeQuality = e.encodeQuality = e.encodeForSigningBatch = e.encodeForMultisigningSponsor = e.encodeForSigningSponsor = e.encodeForMultisigningCounterparty = e.encodeForSigningCounterparty = e.encodeForMultisigning = e.encodeForSigningClaim = e.encodeForSigning = e.encode = e.decode = void 0;
    const i = Ma(), n = Or();
    Object.defineProperty(e, "decodeLedgerData", { enumerable: !0, get: function() {
      return n.decodeLedgerData;
    } });
    const r = Ne();
    Object.defineProperty(e, "XrplDefinitionsBase", { enumerable: !0, get: function() {
      return r.XrplDefinitionsBase;
    } }), Object.defineProperty(e, "TRANSACTION_TYPES", { enumerable: !0, get: function() {
      return r.TRANSACTION_TYPES;
    } }), Object.defineProperty(e, "DEFAULT_DEFINITIONS", { enumerable: !0, get: function() {
      return r.DEFAULT_DEFINITIONS;
    } });
    const t = Va();
    Object.defineProperty(e, "XrplDefinitions", { enumerable: !0, get: function() {
      return t.XrplDefinitions;
    } });
    const o = Ge();
    Object.defineProperty(e, "coreTypes", { enumerable: !0, get: function() {
      return o.coreTypes;
    } });
    const a = te(), { signingData: d, signingClaimData: f, multiSigningData: m, signingBatchData: T, binaryToJSON: A, serializeObject: c } = i.binary;
    function y(R, v) {
      if (typeof R != "string")
        throw new Error("binary must be a hex string");
      return A(R, v);
    }
    e.decode = y;
    function b(R, v) {
      if (typeof R != "object")
        throw new Error();
      return (0, a.bytesToHex)(c(R, { definitions: v }));
    }
    e.encode = b;
    function E(R, v) {
      if (typeof R != "object")
        throw new Error();
      return (0, a.bytesToHex)(d(R, i.HashPrefix.transactionSig, {
        definitions: v
      }));
    }
    e.encodeForSigning = E;
    function l(R) {
      if (typeof R != "object")
        throw new Error();
      return (0, a.bytesToHex)(f(R));
    }
    e.encodeForSigningClaim = l;
    function p(R, v, V) {
      if (typeof R != "object")
        throw new Error();
      const q = V ? { definitions: V } : void 0;
      return (0, a.bytesToHex)(m(R, v, q));
    }
    e.encodeForMultisigning = p;
    function D(R, v) {
      if (typeof R != "object")
        throw new Error();
      return (0, a.bytesToHex)(d(R, i.HashPrefix.counterpartyTransactionSig, {
        definitions: v
      }));
    }
    e.encodeForSigningCounterparty = D;
    function P(R, v, V) {
      if (typeof R != "object")
        throw new Error();
      return (0, a.bytesToHex)(m(R, v, {
        prefix: i.HashPrefix.counterpartyTransactionMultiSig,
        definitions: V
      }));
    }
    e.encodeForMultisigningCounterparty = P;
    function I(R, v) {
      if (typeof R != "object")
        throw new Error();
      return (0, a.bytesToHex)(d(R, i.HashPrefix.sponsorTransactionSig, {
        definitions: v
      }));
    }
    e.encodeForSigningSponsor = I;
    function F(R, v, V) {
      if (typeof R != "object")
        throw new Error();
      return (0, a.bytesToHex)(m(R, v, {
        prefix: i.HashPrefix.sponsorTransactionMultiSig,
        definitions: V
      }));
    }
    e.encodeForMultisigningSponsor = F;
    function C(R) {
      if (typeof R != "object")
        throw new Error("Need an object to encode a Batch transaction");
      return (0, a.bytesToHex)(T(R));
    }
    e.encodeForSigningBatch = C;
    function B(R) {
      if (typeof R != "string")
        throw new Error();
      return (0, a.bytesToHex)(i.quality.encode(R));
    }
    e.encodeQuality = B;
    function z(R) {
      if (typeof R != "string")
        throw new Error();
      return i.quality.decode(R).toString();
    }
    e.decodeQuality = z;
  })(Zt)), Zt;
}
var Fr = za();
const va = /* @__PURE__ */ Br(Fr), ja = /* @__PURE__ */ Cr({
  __proto__: null,
  default: va
}, [Fr]);
export {
  ja as i
};
