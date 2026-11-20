// Starts with the last two path parts ("lib/index.js") and adds more parts
// only when two files would otherwise get the same label.
export function buildLabels(nodes) {
  const labels = new Map();
  const parts = nodes.map((n) => (n.file_path || n.file_name || '').split('/'));

  nodes.forEach((n, i) => {
    const make = (d, idx = i) => parts[idx].slice(-d).join('/');
    let depth = Math.min(2, parts[i].length);
    while (
      depth < parts[i].length &&
      nodes.some((_, j) => j !== i && make(depth, j) === make(depth))
    ) {
      depth += 1;
    }
    labels.set(n.id, make(depth));
  });

  return labels;
}