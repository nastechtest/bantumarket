/** Critical route: the PIN screen. No scene, no WebGL, no animation library. */
export default function Handover() {
  return (
    <section>
      <h1>Handover</h1>
      <p>Enter the six-digit code the buyer read out at the meeting.</p>
      <label htmlFor="pin">Handover code</label>
      <input id="pin" inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]*" />
      <button type="button">Confirm handover</button>
      <p className="disclosure">Confirming handover releases the escrow hold. It does not mark the order paid — payment is confirmed by the provider, not by this screen.</p>
    </section>
  );
}
