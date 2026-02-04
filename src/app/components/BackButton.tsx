import Link from "next/link";

export default function BackButton({
  href = "/",
  title = "Volver",
  onClick,
}: {
  href?: string;
  title?: string;
  onClick?: () => void;
}) {
  const className =
    "inline-flex items-center justify-center w-10 h-10 rounded-full border border-white/15 bg-white/5 hover:bg-white/10 transition text-lg";

  if (onClick) {
    return (
      <button type="button" onClick={onClick} title={title} aria-label={title} className={className}>
        ☜
      </button>
    );
  }

  return (
    <Link href={href} title={title} aria-label={title} className={className}>
      ☜
    </Link>
  );
}
