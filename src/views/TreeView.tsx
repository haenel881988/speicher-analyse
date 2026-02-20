import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import * as api from '../api/tauri-api';
import { useAppContext } from '../context/AppContext';
import { formatBytes, formatNumber } from '../utils/format';

interface TreeNode {
  name: string;
  path: string;
  size: number;
  dir_count: number;
  file_count: number;
  children?: TreeNode[];
  error?: string;
}

interface RowData {
  node: TreeNode;
  depth: number;
  parentSize: number;
  expanded: boolean;
}

const CACHE_MAX_SIZE = 500;

export default function TreeView() {
  const { currentScanId, currentPath, showToast } = useAppContext();
  const [rows, setRows] = useState<RowData[]>([]);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [rootPath, setRootPath] = useState('');
  const [rootSize, setRootSize] = useState(0);
  const cacheRef = useRef<Map<string, TreeNode>>(new Map());
  const lastClickedRef = useRef<string | null>(null);

  const fetchNode = useCallback(async (path: string): Promise<TreeNode | null> => {
    const cache = cacheRef.current;
    if (cache.has(path)) {
      const val = cache.get(path)!;
      cache.delete(path);
      cache.set(path, val);
      return val;
    }
    try {
      const node = await api.getTreeNode(currentScanId!, path, 1);
      if (node.error) return null;
      if (cache.size >= CACHE_MAX_SIZE) {
        const oldest = cache.keys().next().value;
        if (oldest) cache.delete(oldest);
      }
      cache.set(path, node);
      return node;
    } catch {
      return null;
    }
  }, [currentScanId]);

  const loadRoot = useCallback(async (path: string) => {
    if (!currentScanId) return;
    const node = await fetchNode(path);
    if (!node) return;
    setRootPath(path);
    setRootSize(node.size);
    setExpandedPaths(new Set([node.path]));
    setSelectedPaths(new Set());

    // Load root + first level children
    const children = node.children || [];
    const sorted = [...children].sort((a, b) => b.size - a.size);
    const newRows: RowData[] = [
      { node, depth: 0, parentSize: node.size, expanded: true },
      ...sorted.map(c => ({ node: c, depth: 1, parentSize: node.size, expanded: false })),
    ];
    setRows(newRows);
  }, [currentScanId, fetchNode]);

  useEffect(() => {
    if (currentScanId && currentPath) {
      cacheRef.current.clear();
      loadRoot(currentPath);
    }
  }, [currentScanId, currentPath, loadRoot]);

  const toggleExpand = useCallback(async (path: string, depth: number) => {
    const isExpanded = expandedPaths.has(path);

    if (isExpanded) {
      // Collapse: remove all children
      setExpandedPaths(prev => {
        const next = new Set(prev);
        next.delete(path);
        return next;
      });
      setRows(prev => {
        const idx = prev.findIndex(r => r.node.path === path);
        if (idx < 0) return prev;
        const parentDepth = prev[idx].depth;
        const result = [...prev];
        result[idx] = { ...result[idx], expanded: false };
        // Remove subsequent rows with deeper depth
        let endIdx = idx + 1;
        while (endIdx < result.length && result[endIdx].depth > parentDepth) endIdx++;
        result.splice(idx + 1, endIdx - idx - 1);
        return result;
      });
    } else {
      // Expand: load and insert children
      const node = await fetchNode(path);
      if (!node || !node.children) return;

      setExpandedPaths(prev => {
        const next = new Set(prev);
        next.add(path);
        return next;
      });

      const sorted = [...node.children].sort((a, b) => b.size - a.size);
      const childRows: RowData[] = sorted.map(c => ({
        node: c, depth: depth + 1, parentSize: node.size, expanded: false,
      }));

      setRows(prev => {
        const idx = prev.findIndex(r => r.node.path === path);
        if (idx < 0) return prev;
        const result = [...prev];
        result[idx] = { ...result[idx], expanded: true };
        result.splice(idx + 1, 0, ...childRows);
        return result;
      });
    }
  }, [expandedPaths, fetchNode]);

  const selectRow = useCallback((path: string, e?: React.MouseEvent) => {
    if (e && (e.ctrlKey || e.metaKey)) {
      setSelectedPaths(prev => {
        const next = new Set(prev);
        if (next.has(path)) next.delete(path); else next.add(path);
        return next;
      });
      lastClickedRef.current = path;
    } else if (e && e.shiftKey && lastClickedRef.current) {
      const startIdx = rows.findIndex(r => r.node.path === lastClickedRef.current);
      const endIdx = rows.findIndex(r => r.node.path === path);
      if (startIdx >= 0 && endIdx >= 0) {
        const [lo, hi] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
        const newSel = new Set<string>();
        for (let i = lo; i <= hi; i++) newSel.add(rows[i].node.path);
        setSelectedPaths(newSel);
      }
    } else {
      setSelectedPaths(new Set([path]));
      lastClickedRef.current = path;
    }
  }, [rows]);

  // Breadcrumb
  const breadcrumbParts = useMemo(() => {
    if (!rootPath) return [];
    const isWindows = rootPath.includes('\\');
    const sep = isWindows ? '\\' : '/';
    const segments = rootPath.split(sep).filter(Boolean);
    let buildPath = '';
    return segments.map((s, i) => {
      buildPath += s + (i === 0 && isWindows ? '\\' : sep);
      return { name: s, path: buildPath };
    });
  }, [rootPath]);

  return (
    <>
      {/* Breadcrumb */}
      <div className="treemap-breadcrumb">
        {breadcrumbParts.map((part, i) => (
          <span key={i}>
            {i > 0 && <span className="breadcrumb-sep">{'\u203A'}</span>}
            {i === breadcrumbParts.length - 1 ? (
              <span className="breadcrumb-current">{part.name}</span>
            ) : (
              <span className="breadcrumb-item" style={{ cursor: 'pointer' }} onClick={() => loadRoot(part.path)}>{part.name}</span>
            )}
          </span>
        ))}
      </div>

      {/* Tree header */}
      <div className="tree-header" style={{ display: 'flex', gap: 4, padding: '4px 12px', fontSize: 11, color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)' }}>
        <span style={{ flex: 1 }}>Name</span>
        <span style={{ width: 120, textAlign: 'center' }}>Größe</span>
        <span style={{ width: 60, textAlign: 'center' }}>Elemente</span>
        <span style={{ width: 50, textAlign: 'right' }}>%</span>
      </div>

      {/* Tree rows */}
      <div className="tree-container" style={{ overflow: 'auto', flex: 1 }}>
        {!currentScanId && <div className="tool-placeholder">Bitte zuerst ein Laufwerk scannen</div>}
        {rows.map((r) => {
          const hasChildren = r.node.dir_count > 0;
          const pct = r.parentSize > 0 ? (r.node.size / r.parentSize * 100) : 0;
          const itemCount = r.node.file_count + r.node.dir_count;
          const isSelected = selectedPaths.has(r.node.path);

          return (
            <div
              key={r.node.path}
              className={`tree-row ${isSelected ? 'selected' : ''}`}
              style={{ paddingLeft: 12 + r.depth * 20 }}
              onClick={(e) => { selectRow(r.node.path, e); if (hasChildren) toggleExpand(r.node.path, r.depth); }}
              onDoubleClick={() => api.openInExplorer(r.node.path)}
            >
              <span className={`tree-arrow ${r.expanded ? 'expanded' : ''} ${!hasChildren ? 'empty' : ''}`}>{'\u25B6'}</span>
              <span className="tree-icon">{'\uD83D\uDCC1'}</span>
              <span className="tree-name" title={r.node.path}>{r.node.name}</span>
              <span className="tree-bar">
                <div className="size-bar"><div className="size-bar-fill" style={{ width: Math.max(pct, 0.5) + '%' }} /></div>
              </span>
              <span className="tree-size">{formatBytes(r.node.size)}</span>
              <span className="tree-items">{formatNumber(itemCount)}</span>
              <span className="tree-pct">{pct.toFixed(1)}%</span>
            </div>
          );
        })}
      </div>
    </>
  );
}
