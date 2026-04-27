"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  Bold,
  Code2,
  Heading1,
  Italic,
  Link,
  List,
  ListOrdered,
  Pilcrow,
  Quote,
  Send,
  Strikethrough,
  Table,
  Trash2,
  Underline,
} from "lucide-react";
import SlashCommandMenu, { SlashCommand } from "./SlashCommandMenu";
import LinkDialog from "./LinkDialog";
import TableDialog from "./TableDialog";

type RichMessageInputProps = {
  placeholder: string;
  disabled?: boolean;
  submitDisabled?: boolean;
  onSubmit: (content: string) => Promise<void> | void;
  onSlashCommands?: SlashCommand[];
  onEditorChange?: (content: string) => void;
  appendTextToken?: string | null;
  onTokenConsumed?: () => void;
};

const QUICK_MARKDOWN_COMMANDS = [
  { id: "header", title: "/header", description: "Heading 1", snippet: "# " },
  { id: "bullets", title: "/bullets", description: "Bullet list", snippet: "- " },
  { id: "numbered", title: "/numbered", description: "Numbered list", snippet: "1. " },
  { id: "quote", title: "/quote", description: "Block quote", snippet: "> " },
  { id: "codeblock", title: "/codeblock", description: "Code block", snippet: "```\ncode\n```" },
  {
    id: "table",
    title: "/table",
    description: "Insert markdown table",
    snippet: "| Column 1 | Column 2 |\n| --- | --- |\n| Value 1 | Value 2 |",
  },
  { id: "ticks", title: "/ticks", description: "Inline code", snippet: "`text`" },
  { id: "link", title: "/link", description: "Insert link", snippet: "[label](https://example.com)" },
  { id: "strike", title: "/strike", description: "Strikethrough", snippet: "~~text~~" },
  { id: "underline", title: "/underline", description: "Underline", snippet: "<u>text</u>" },
  { id: "sup", title: "/sup", description: "Superscript", snippet: "<sup>2</sup>" },
  { id: "sub", title: "/sub", description: "Subscript", snippet: "<sub>2</sub>" },
  { id: "p", title: "/p", description: "Paragraph", snippet: "" },
];

export default function RichMessageInput({
  placeholder,
  disabled,
  submitDisabled,
  onSubmit,
  onSlashCommands = [],
  onEditorChange,
  appendTextToken,
  onTokenConsumed,
}: RichMessageInputProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [markdown, setMarkdown] = useState("");
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [showTableDialog, setShowTableDialog] = useState(false);

  const replaceWithMarkdown = useCallback((nextMarkdown: string) => {
    setMarkdown(nextMarkdown);
    onEditorChange?.(nextMarkdown);
    setShowSlashMenu(nextMarkdown.trimStart().startsWith("/"));
    if (textareaRef.current) {
      textareaRef.current.value = nextMarkdown;
      textareaRef.current.focus();
    }
  }, [onEditorChange]);

  const moveCaretToEnd = useCallback(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(textareaRef.current.value.length, textareaRef.current.value.length);
    }
  }, []);

  const appendInlineAtEnd = useCallback((text: string) => {
    setMarkdown((prev) => {
      const next = prev + text;
      onEditorChange?.(next);
      if (textareaRef.current) {
        textareaRef.current.value = next;
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(textareaRef.current.value.length, textareaRef.current.value.length);
      }
      return next;
    });
  }, [onEditorChange]);

  const handleLink = useCallback(() => {
    setShowLinkDialog(true);
  }, []);

  const handleLinkConfirm = useCallback((url: string) => {
    void appendInlineAtEnd(`[${url}](${url})`);
  }, [appendInlineAtEnd]);

  const handleTable = useCallback(() => {
    setShowTableDialog(true);
  }, []);

  const handleTableConfirm = useCallback(async (rows: number, cols: number) => {
    const generateTableMarkdown = (r: number, c: number) => {
      let markdown = "";
      // Header row
      markdown += "| " + Array.from({ length: c }, (_, i) => `Column ${i + 1}`).join(" | ") + " |\n";
      // Separator row
      markdown += "| " + Array.from({ length: c }, () => "---").join(" | ") + " |\n";
      // Data rows
      for (let i = 0; i < r - 1; i++) {
        markdown += "| " + Array.from({ length: c }, (_, j) => `Value ${i + 1}-${j + 1}`).join(" | ") + " |\n";
      }
      return markdown.trim();
    };
    
    const tableMarkdown = generateTableMarkdown(rows, cols);
    const separator = markdown && !/\n$/.test(markdown) ? "\n\n" : "";
    await replaceWithMarkdown(`${markdown}${separator}${tableMarkdown}`);
    // Move cursor to end so users can continue typing
    moveCaretToEnd();
  }, [markdown, replaceWithMarkdown, moveCaretToEnd]);

  useEffect(() => {
    if (!appendTextToken) return;
    
    void appendInlineAtEnd(appendTextToken);
    
    // Notify parent to clear the token
    onTokenConsumed?.();
  }, [appendTextToken, onTokenConsumed, appendInlineAtEnd]);

  const submitCurrent = useCallback(async () => {
    const current = markdown.trim();
    if (!current || disabled || submitDisabled) return;
    await onSubmit(markdown);
    await replaceWithMarkdown("");
  }, [disabled, markdown, onSubmit, replaceWithMarkdown, submitDisabled]);

  const toggleHeading = useCallback(async () => {
    if (markdown.trimStart().startsWith("# ")) {
      await replaceWithMarkdown(markdown.replace(/^#\s+/, ""));
      return;
    }
    await replaceWithMarkdown(`# ${markdown || "Heading"}`);
  }, [markdown, replaceWithMarkdown]);

  const formattingCommands = useMemo(
    () => [
      { icon: <Bold className="size-4" />, action: () => appendInlineAtEnd("**bold**") },
      { icon: <Italic className="size-4" />, action: () => appendInlineAtEnd("*italic*") },
      { icon: <Underline className="size-4" />, action: () => appendInlineAtEnd("<u>underline</u>") },
      { icon: <Strikethrough className="size-4" />, action: () => appendInlineAtEnd("~~strike~~") },
      { icon: <Code2 className="size-4" />, action: () => appendInlineAtEnd("`code`") },
      { icon: <Heading1 className="size-4" />, action: toggleHeading },
      { icon: <List className="size-4" />, action: () => replaceWithMarkdown(`- ${markdown || "List item"}`) },
      { icon: <ListOrdered className="size-4" />, action: () => replaceWithMarkdown(`1. ${markdown || "List item"}`) },
      { icon: <Quote className="size-4" />, action: () => replaceWithMarkdown(`> ${markdown || "Quote"}`) },
      {
        icon: <Table className="size-4" />,
        action: handleTable,
      },
      { icon: <Pilcrow className="size-4" />, action: () => replaceWithMarkdown(markdown.replace(/^#+\s+/, "")) },
      { icon: <Link className="size-4" />, action: handleLink },
    ],
    [appendInlineAtEnd, markdown, replaceWithMarkdown, toggleHeading, handleLink, handleTable]
  );

  const slashCommands: SlashCommand[] = useMemo(() => {
    const quick = QUICK_MARKDOWN_COMMANDS.map((cmd) => ({
      id: cmd.id,
      title: cmd.title,
      description: cmd.description,
      keywords: ["markdown", "format", cmd.id],
      icon: <Code2 className="size-4" />,
      onSelect: async () => {
        await replaceWithMarkdown(cmd.snippet);
        setShowSlashMenu(false);
      },
    }));
    return [...quick, ...onSlashCommands];
  }, [onSlashCommands, replaceWithMarkdown]);

  return (
    <div ref={wrapperRef} className="relative z-0">
      {/* Slash menu positioned outside the overflow-hidden container */}
      {showSlashMenu && slashCommands.length > 0 && (
        <div className="absolute bottom-full left-0 right-0 mb-2 z-[9999]">
          <SlashCommandMenu query={markdown.replace(/^\//, "")} commands={slashCommands} />
        </div>
      )}
      <div className="rounded-md border border-border bg-background overflow-hidden">
      <div className="flex items-center gap-1 border-b border-border px-2 py-1 flex-shrink-0">
        {formattingCommands.map((btn, index) => (
          <button
            key={index}
            type="button"
            onClick={btn.action}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            disabled={disabled}
          >
            {btn.icon}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1.5">
          {/* Removed the problematic color picker buttons - now handled by floating toolbar */}
        </div>
      </div>
      <div className="min-h-[64px] max-h-[200px] overflow-auto px-3 py-1.5 flex-1 relative">
        <textarea
          ref={textareaRef}
          value={markdown}
          onChange={(e) => {
            setMarkdown(e.target.value);
            onEditorChange?.(e.target.value);
            setShowSlashMenu(e.target.value.trimStart().startsWith("/"));
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submitCurrent();
            } else if (e.key === "Escape") {
              setShowSlashMenu(false);
            } else if (e.key === "Backspace" || e.key === "Delete") {
              const target = e.target as HTMLTextAreaElement;
              setShowSlashMenu(target.value.trimStart().startsWith("/"));
            }
          }}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full h-full min-h-[64px] max-h-[200px] resize-none bg-transparent outline-none text-[14px] text-foreground"
        />
      </div>
      
      {/* Link Dialog */}
      <LinkDialog
        isOpen={showLinkDialog}
        onClose={() => setShowLinkDialog(false)}
        onConfirm={handleLinkConfirm}
      />
      
      {/* Table Dialog */}
      <TableDialog
        isOpen={showTableDialog}
        onClose={() => setShowTableDialog(false)}
        onConfirm={handleTableConfirm}
      />
      
      <div className="flex justify-end gap-2 px-2 pb-2">
        <button
          type="button"
          onClick={() => {
            void replaceWithMarkdown("");
          }}
          disabled={!markdown.trim() || disabled}
          className="h-10 w-10 inline-flex items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
          title="Clear input"
        >
          <Trash2 className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => {
            void submitCurrent();
          }}
          disabled={!markdown.trim() || disabled || submitDisabled}
          className="h-10 w-10 inline-flex items-center justify-center rounded-md bg-foreground text-background hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          <Send className="size-4" />
        </button>
      </div>
      </div>
    </div>
  );
}
