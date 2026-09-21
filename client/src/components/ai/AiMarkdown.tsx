import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "../../lib/cn";
import "./ai.css";

/**
 * Renders a streamed reply. `react-markdown` never emits raw HTML, so model
 * output cannot inject markup; links open in a new tab. While `streaming`, a
 * caret sits after the last node so a pause reads as "still typing".
 */
export function AiMarkdown({
  text,
  streaming = false,
  className
}: {
  text: string;
  streaming?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "ai-md text-sm text-ink",
        streaming && "ai-caret",
        className
      )}
    >
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          )
        }}
      >
        {text}
      </Markdown>
    </div>
  );
}
