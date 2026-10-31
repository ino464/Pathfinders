import Link from "next/link";
import { AccountDetails } from "./account-details";

export default function AccountPage() {
  return (
    <main>
      <Link href="/">All sessions</Link>
      <h1>Account</h1>
      <AccountDetails />
    </main>
  );
}
