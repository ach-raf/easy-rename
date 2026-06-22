interface Props {
  dir: string;
  base: string;
  abs: string;
}

/**
 * Renders a file path with the subfolder portion dimmed and the filename
 * emphasized. Wrapping (overflow-wrap: anywhere) is handled in CSS so long
 * tokens never get truncated — the full path is also exposed via the `title`.
 */
export function FilePath({ dir, base, abs }: Props) {
  return (
    <span className="path" title={abs}>
      {dir && <span className="dir">{dir}/</span>}
      <span className="base">{base}</span>
    </span>
  );
}
