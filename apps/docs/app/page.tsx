import Link from "next/link";

const title = "Root";
const description = "<p align=\"center\" <picture <source srcset=\"./banner dark.png\" media=\"(prefers color scheme: dark)\"/ <source srcset=\"./banner.png\" media=\"(prefers color scheme: light)\"/ <img src=\"./banner.png\" alt=\"Better Auth Logo\"/ </picture <h2 align=\"center\" Better Auth </h2";

export default function HomePage() {
  return (
    <main style={{ padding: 32 }}>
      <h1>{title}</h1>
      <p>{description}</p>
      <Link href="/docs">Open docs</Link>
    </main>
  );
}
