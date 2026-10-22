/** Critical route. Imports nothing from the scene runtime — the fence (07 §4.3) fails the build if that changes. */
export default function Checkout() {
  return (
    <section>
      <h1>Checkout</h1>
      <p>Order ord_01 · Seiko “Presage” · R4,200</p>
      <p>Commission R420 (10%) is taken from the seller on completion, and reversed in full if the order is refunded.</p>
      <button type="button">Pay R4,200</button>
    </section>
  );
}
