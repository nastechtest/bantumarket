/** Critical route. */
export default function SignIn() {
  return (
    <section>
      <h1>Sign in</h1>
      <label htmlFor="e">Email</label>
      <input id="e" type="email" autoComplete="email" />
      <label htmlFor="p">Password</label>
      <input id="p" type="password" autoComplete="current-password" />
      <button type="button">Continue</button>
      <p>Or use the code sent to your phone.</p>
    </section>
  );
}
