/** iyzico kart bilgileri (billing-service'te de aynı interface var) */
export interface IyzicoCardDetails {
  cardHolderName: string;
  cardNumber:     string;
  expireMonth:    string;
  expireYear:     string;
  cvc:            string;
}
