import Link from "next/link";

const title = "Better Auth";
const description = "The most comprehensive authentication framework for TypeScript.";

export default function HomePage() {
  return (
    <main style={{ padding: 32 }}>
      <h1>{title}</h1>
      <p>{description}</p>
      <Link href="/docs">Open docs</Link>
    </main>
  );
}
