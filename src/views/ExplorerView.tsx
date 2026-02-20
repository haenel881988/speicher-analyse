import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import * as api from '../api/tauri-api';
import { useAppContext } from '../context/AppContext';
import { formatBytes } from '../utils/format';
import { FileIcon, QaIcon, isTempFile, getSizeClass, TAG_COLORS } from '../utils/file-icons';

interface FileEntry {
  name: string;
  path: string;
  size: number;
  isDirectory: boolean;
  extension: string;
  modified: number;
}

interface KnownFolder { name: string; path: string; icon: string; }
interface Drive { mountpoint: string; device: string; free: number; percent: number; }

type SortCol = 'name' | 'size' | 'type' | 'modified';

const COLUMNS = [
  { id: 'icon' as const, label: '', width: 36, sortable: false, align: 'center' as const },
  { id: 'name' as const, label: 'Name', width: 300, sortable: true, align: 'left' as const },
  { id: 'size' as const, label: 'Größe', width: 100, sortable: true, align: 'right' as const },
  { id: 'type' as const, label: 'Typ', width: 120, sortable: true, align: 'left' as const },
  { id: 'modified' as const, label: 'Geändert', width: 160, sortable: true, align: 'left' as const },
];

export default function ExplorerView() {
  const { currentScanId, showToast, setActiveTab, setPendingPdfPath, setPropertiesPath } = useAppContext();
  const [currentPath, setCurrentPath] = useState('');
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [filteredEntries, setFilteredEntries] = useState<FileEntry[] | null>(null);
  const [historyBack, setHistoryBack] = useState<string[]>([]);
  const [historyForward, setHistoryForward] = useState<string[]>([]);
  const [sortCol, setSortCol] = useState<SortCol>('name');
  const [sortAsc, setSortAsc] = useState(true);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [addressMode, setAddressMode] = useState<'breadcrumb' | 'input'>('breadcrumb');
  const [knownFolders, setKnownFolders] = useState<KnownFolder[]>([]);
  const [drives, setDrives] = useState<Drive[]>([]);
  const [emptyFolderPaths, setEmptyFolderPaths] = useState<Set<string>>(new Set());
  const [dirTags, setDirTags] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [statusText, setStatusText] = useState('');
  const [omnibarSearching, setOmnibarSearching] = useState(false);
  const [deepSearchRunning, setDeepSearchRunning] = useState(false);
  const [omniResults, setOmniResults] = useState<any[]>([]);
  const [omniCountText, setOmniCountText] = useState('');
  const [folderSizes, setFolderSizes] = useState<Record<string, any> | null>(null);
  const [parentFolderSize, setParentFolderSize] = useState(0);
  const [showSizeColors, setShowSizeColors] = useState(false);
  const [findingEmpty, setFindingEmpty] = useState(false);
  const [renamePath, setRenamePath] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; entry: FileEntry | null } | null>(null);
  const [newFolderName, setNewFolderName] = useState<string | null>(null);
  const [moveTarget, setMoveTarget] = useState<string | null>(null);
  const [clipboard, setClipboard] = useState<{ paths: string[]; cut: boolean } | null>(null);

  const lastClickedRef = useRef<string | null>(null);
  const deepSearchUnlistenRef = useRef<Array<() => void>>([]);
  const dirCacheRef = useRef<Map<string, { data: any; time: number }>>(new Map());
  const navGenerationRef = useRef(0);
  const columnWidthsRef = useRef<Record<string, number>>(
    (() => { try { const s = localStorage.getItem('explorer-col-widths-default'); return s ? JSON.parse(s) : {}; } catch { return {}; } })()
  );
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileListRef = useRef<HTMLDivElement>(null);
  const addressInputRef = useRef<HTMLInputElement>(null);

  // Init: load known folders + drives + preferences, navigate to default
  useEffect(() => {
    (async () => {
      let folders: KnownFolder[] = [];
      let drv: Drive[] = [];
      try { folders = await api.getKnownFolders(); } catch {}
      try { drv = await api.getDrives(); } catch {}
      try { const prefs = await api.getPreferences(); setShowSizeColors(!!prefs.showSizeColors); } catch {}
      setKnownFolders(folders);
      setDrives(drv);
      const defaultPath = folders.length > 0 ? folders[0].path : 'C:\\';
      navigateTo(defaultPath, false);
    })();
  }, []);

  const navigateTo = useCallback(async (dirPath: string, addToHistory = true) => {
    if (addToHistory && currentPath) {
      setHistoryBack(prev => [...prev, currentPath]);
      setHistoryForward([]);
    }
    setCurrentPath(dirPath);
    setSelectedPaths(new Set());
    setEmptyFolderPaths(new Set());
    setFilteredEntries(null);
    setOmnibarSearching(false);
    setLoading(true);
    setErrorText('');

    // Generation counter to prevent stale async results from overwriting newer navigation
    const generation = ++navGenerationRef.current;

    // Check cache
    const cached = dirCacheRef.current.get(dirPath);
    const now = Date.now();
    let result;
    try {
      if (cached && (now - cached.time) < 5000) {
        result = cached.data;
      } else {
        result = await api.listDirectory(dirPath);
        dirCacheRef.current.set(dirPath, { data: result, time: now });
        if (dirCacheRef.current.size > 10) {
          const oldest = dirCacheRef.current.keys().next().value;
          if (oldest) dirCacheRef.current.delete(oldest);
        }
      }
    } catch (err: any) {
      if (generation !== navGenerationRef.current) return;
      setErrorText(err.message || 'Verzeichnis konnte nicht geladen werden');
      setEntries([]);
      setLoading(false);
      return;
    }

    // Stale navigation — a newer navigateTo was called while we awaited
    if (generation !== navGenerationRef.current) return;

    if (result.error) {
      setErrorText(result.error);
      setEntries([]);
      setLoading(false);
      return;
    }

    const newEntries: FileEntry[] = result.entries;
    // Load file tags
    let tags: Record<string, any> = {};
    try { tags = await api.getTagsForDirectory(dirPath); } catch {}
    if (generation !== navGenerationRef.current) return;
    setDirTags(tags);

    // Enrich folder sizes from scan data
    let fSizes: Record<string, any> | null = null;
    let pSize = 0;
    if (currentScanId) {
      const folderPaths = newEntries.filter(e => e.isDirectory).map(e => e.path);
      if (folderPaths.length > 0) {
        try {
          const data = await api.getFolderSizesBulk(currentScanId, folderPaths, dirPath);
          if (generation !== navGenerationRef.current) return;
          if (data?.folders) {
            fSizes = data.folders;
            pSize = data.parent?.size || 0;
            for (const entry of newEntries) {
              if (entry.isDirectory && data.folders[entry.path]) entry.size = data.folders[entry.path].size;
            }
          }
        } catch {}
      }
    }
    if (generation !== navGenerationRef.current) return;
    setFolderSizes(fSizes);
    setParentFolderSize(pSize);

    setEntries(newEntries);
    setLoading(false);

    // Status
    const dirs = newEntries.filter(e => e.isDirectory).length;
    const files = newEntries.filter(e => !e.isDirectory).length;
    const totalSize = newEntries.filter(e => !e.isDirectory).reduce((s, e) => s + e.size, 0);
    setStatusText(`${dirs} Ordner, ${files} Dateien — ${formatBytes(pSize > 0 ? pSize : totalSize)}`);
  }, [currentPath, currentScanId]);

  const goBack = useCallback(() => {
    if (historyBack.length === 0) return;
    const prev = historyBack[historyBack.length - 1];
    setHistoryForward(fwd => [currentPath, ...fwd]);
    setHistoryBack(back => back.slice(0, -1));
    navigateTo(prev, false);
  }, [historyBack, currentPath, navigateTo]);

  const goForward = useCallback(() => {
    if (historyForward.length === 0) return;
    const next = historyForward[0];
    setHistoryBack(back => [...back, currentPath]);
    setHistoryForward(fwd => fwd.slice(1));
    navigateTo(next, false);
  }, [historyForward, currentPath, navigateTo]);

  const goUp = useCallback(() => {
    if (/^[A-Z]:\\$/i.test(currentPath)) return;
    const parent = currentPath.substring(0, Math.max(currentPath.lastIndexOf('\\'), currentPath.lastIndexOf('/')));
    const normalized = /^[A-Z]:$/i.test(parent) ? parent + '\\' : parent;
    if (normalized && normalized !== currentPath) navigateTo(normalized);
  }, [currentPath, navigateTo]);

  const refresh = useCallback(() => {
    if (currentPath) {
      dirCacheRef.current.delete(currentPath);
      navigateTo(currentPath, false);
    }
  }, [currentPath, navigateTo]);

  const selectAll = useCallback(() => {
    setSelectedPaths(new Set(entries.map(e => e.path)));
  }, [entries]);

  const handleSort = useCallback((col: SortCol) => {
    if (sortCol === col) setSortAsc(!sortAsc);
    else { setSortCol(col); setSortAsc(col === 'name'); }
  }, [sortCol, sortAsc]);

  const sortedEntries = useMemo((): FileEntry[] => {
    const source = filteredEntries || entries;
    return [...source].sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      let va: any, vb: any;
      switch (sortCol) {
        case 'name': va = a.name.toLowerCase(); vb = b.name.toLowerCase(); break;
        case 'size': va = a.size; vb = b.size; break;
        case 'type': va = (a.extension || '').toLowerCase(); vb = (b.extension || '').toLowerCase(); break;
        case 'modified': va = a.modified || 0; vb = b.modified || 0; break;
        default: va = a.name.toLowerCase(); vb = b.name.toLowerCase();
      }
      if (va < vb) return sortAsc ? -1 : 1;
      if (va > vb) return sortAsc ? 1 : -1;
      return 0;
    });
  }, [entries, filteredEntries, sortCol, sortAsc]);

  const selectRow = useCallback((path: string, e?: React.MouseEvent) => {
    if (e && (e.ctrlKey || e.metaKey)) {
      setSelectedPaths(prev => {
        const next = new Set(prev);
        if (next.has(path)) next.delete(path); else next.add(path);
        return next;
      });
      lastClickedRef.current = path;
    } else if (e && e.shiftKey && lastClickedRef.current) {
      const startIdx = sortedEntries.findIndex(en => en.path === lastClickedRef.current);
      const endIdx = sortedEntries.findIndex(en => en.path === path);
      if (startIdx >= 0 && endIdx >= 0) {
        const [lo, hi] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
        const newSel = new Set<string>();
        for (let i = lo; i <= hi; i++) newSel.add(sortedEntries[i].path);
        setSelectedPaths(newSel);
      }
    } else {
      setSelectedPaths(new Set([path]));
      lastClickedRef.current = path;
    }
  }, [sortedEntries]);

  const handleDoubleClick = useCallback((entry: FileEntry) => {
    if (entry.isDirectory) {
      navigateTo(entry.path);
    } else if (entry.extension?.toLowerCase() === '.pdf') {
      // PDF → interner PDF-Editor
      setPendingPdfPath(entry.path);
      setActiveTab('pdf-editor');
    } else {
      api.openFile(entry.path);
    }
  }, [navigateTo, setPendingPdfPath, setActiveTab]);

  const handleDelete = useCallback(async (permanent: boolean) => {
    const paths = [...selectedPaths];
    const msg = permanent
      ? `${paths.length} Element(e) endgültig löschen?\n\nDieser Vorgang kann nicht rückgängig gemacht werden!`
      : `${paths.length} Element(e) in den Papierkorb verschieben?`;
    const result = await api.showConfirmDialog({
      type: permanent ? 'warning' : 'question',
      title: permanent ? 'Endgültig löschen' : 'In Papierkorb verschieben',
      message: msg, buttons: ['Abbrechen', 'Löschen'], defaultId: 0,
    });
    if (result.response !== 1) return;
    if (permanent) await api.deletePermanent(paths);
    else await api.deleteToTrash(paths);
    refresh();
  }, [selectedPaths, refresh]);

  const handleRename = useCallback(async () => {
    if (!renamePath || !renameValue.trim()) { setRenamePath(null); return; }
    const entry = entries.find(e => e.path === renamePath);
    if (!entry || renameValue.trim() === entry.name) { setRenamePath(null); return; }
    try {
      const result = await api.rename(renamePath, renameValue.trim());
      if (result.success) refresh();
    } catch {}
    setRenamePath(null);
  }, [renamePath, renameValue, entries, refresh]);

  // Close context menu on click anywhere or Escape
  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('click', close);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('click', close); document.removeEventListener('keydown', onKey); };
  }, [ctxMenu]);

  const handleContextMenu = useCallback((e: React.MouseEvent, entry: FileEntry | null) => {
    e.preventDefault();
    e.stopPropagation();
    // If right-clicking an unselected entry, select only that entry
    if (entry && !selectedPaths.has(entry.path)) {
      setSelectedPaths(new Set([entry.path]));
    }
    setCtxMenu({ x: e.clientX, y: e.clientY, entry });
  }, [selectedPaths]);

  const ctxAction = useCallback(async (action: string) => {
    setCtxMenu(null);
    const paths = [...selectedPaths];
    const entry = ctxMenu?.entry;
    const singlePath = entry?.path || paths[0];

    switch (action) {
      case 'open':
        if (entry) handleDoubleClick(entry);
        break;
      case 'open-with':
        if (singlePath) api.openWithDialog(singlePath);
        break;
      case 'edit':
        if (singlePath) api.editInEditor(singlePath);
        break;
      case 'open-in-explorer':
        if (singlePath) api.showInExplorer(singlePath);
        break;
      case 'open-terminal':
        if (singlePath) api.openInTerminal(entry?.isDirectory ? singlePath : currentPath);
        break;
      case 'copy-path':
        if (singlePath) { api.copyToClipboard(singlePath); showToast('Pfad kopiert', 'info'); }
        break;
      case 'rename':
        if (entry) { setRenamePath(entry.path); setRenameValue(entry.name); }
        break;
      case 'trash':
        await handleDelete(false);
        break;
      case 'delete-permanent':
        await handleDelete(true);
        break;
      case 'new-folder':
        setNewFolderName('');
        break;
      case 'move-to': {
        const result = await api.showSaveDialog({ title: 'Zielordner wählen', directory: true });
        const moveDest = result?.path;
        if (moveDest && !result.canceled) {
          try {
            await api.move(paths, moveDest);
            showToast(`${paths.length} Element(e) verschoben`, 'info');
            refresh();
          } catch (err: any) { showToast('Fehler: ' + err.message, 'error'); }
        }
        break;
      }
      case 'copy-to': {
        const result = await api.showSaveDialog({ title: 'Zielordner wählen', directory: true });
        const copyDest = result?.path;
        if (copyDest && !result.canceled) {
          try {
            await api.copy(paths, copyDest);
            showToast(`${paths.length} Element(e) kopiert`, 'info');
          } catch (err: any) { showToast('Fehler: ' + err.message, 'error'); }
        }
        break;
      }
      case 'create-zip':
        try {
          await api.createArchive(paths);
          showToast('ZIP erstellt', 'info');
          refresh();
        } catch (err: any) { showToast('Fehler: ' + err.message, 'error'); }
        break;
      case 'extract':
        if (singlePath) {
          try {
            await api.extractArchive(singlePath);
            showToast('Archiv entpackt', 'info');
            refresh();
          } catch (err: any) { showToast('Fehler: ' + err.message, 'error'); }
        }
        break;
      case 'properties':
        if (singlePath) setPropertiesPath(singlePath);
        break;
      case 'open-system-default':
        if (singlePath) api.openFile(singlePath);
        break;
      case 'run-as-admin':
        if (singlePath) api.runAsAdmin(singlePath);
        break;
      case 'tag-red': case 'tag-orange': case 'tag-yellow': case 'tag-green': case 'tag-blue': case 'tag-purple':
        if (singlePath) {
          const color = action.replace('tag-', '');
          try { await api.setFileTag(singlePath, color, ''); refresh(); } catch {}
        }
        break;
      case 'tag-remove':
        if (singlePath) {
          try { await api.removeFileTag(singlePath); refresh(); } catch {}
        }
        break;
      case 'cut':
        if (paths.length > 0) {
          setClipboard({ paths, cut: true });
          showToast(`${paths.length} Element(e) ausgeschnitten`, 'info');
        }
        break;
      case 'copy-files':
        if (paths.length > 0) {
          setClipboard({ paths, cut: false });
          showToast(`${paths.length} Element(e) kopiert`, 'info');
        }
        break;
      case 'paste':
        if (clipboard && clipboard.paths.length > 0) {
          try {
            if (clipboard.cut) {
              await api.move(clipboard.paths, currentPath);
              setClipboard(null);
            } else {
              await api.copy(clipboard.paths, currentPath);
            }
            showToast(`${clipboard.paths.length} Element(e) eingefügt`, 'info');
            refresh();
          } catch (err: any) { showToast('Fehler: ' + err.message, 'error'); }
        }
        break;
      case 'new-textfile': {
        const fileName = 'Neues Textdokument.txt';
        try {
          const fullPath = currentPath.replace(/[\\/]$/, '') + '\\' + fileName;
          await api.writeFileContent(fullPath, '');
          refresh();
          setRenamePath(fullPath);
          setRenameValue(fileName);
        } catch (err: any) { showToast('Fehler: ' + err.message, 'error'); }
        break;
      }
      case 'paste-into':
        if (clipboard && clipboard.paths.length > 0 && entry?.isDirectory) {
          try {
            if (clipboard.cut) {
              await api.move(clipboard.paths, entry.path);
              setClipboard(null);
            } else {
              await api.copy(clipboard.paths, entry.path);
            }
            showToast(`${clipboard.paths.length} Element(e) in "${entry.name}" eingefügt`, 'info');
            refresh();
          } catch (err: any) { showToast('Fehler: ' + err.message, 'error'); }
        }
        break;
      case 'refresh':
        refresh();
        break;
      case 'folder-properties':
        if (currentPath) setPropertiesPath(currentPath);
        break;
    }
  }, [ctxMenu, selectedPaths, currentPath, clipboard, navigateTo, handleDelete, handleDoubleClick, refresh, showToast, setPropertiesPath]);

  const handleNewFolder = useCallback(async () => {
    if (newFolderName === null) return;
    const name = newFolderName.trim();
    if (!name) { setNewFolderName(null); return; }
    try {
      await api.createFolder(currentPath, name);
      refresh();
    } catch (err: any) { showToast('Fehler: ' + err.message, 'error'); }
    setNewFolderName(null);
  }, [newFolderName, currentPath, refresh, showToast]);

  const findEmptyFolders = useCallback(async () => {
    setFindingEmpty(true);
    try {
      const result = await api.findEmptyFolders(currentPath, 3) as any;
      const folders = Array.isArray(result) ? result : (result.emptyFolders || []);
      const count = Array.isArray(result) ? result.length : (result.count || 0);
      setEmptyFolderPaths(new Set(folders.map((f: any) => typeof f === 'string' ? f : f.path)));
      setStatusText(count === 0 ? 'Keine leeren Ordner gefunden' : `${count} leere Ordner gefunden`);
    } catch { setStatusText('Fehler beim Suchen'); }
    setFindingEmpty(false);
  }, [currentPath]);

  const handleOmnibarSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setFilteredEntries(null);
      setOmnibarSearching(false);
      setOmniResults([]);
      return;
    }

    // Local filter
    const q = query.trim().toLowerCase();
    setFilteredEntries(entries.filter(e => e.name.toLowerCase().includes(q)));
    setOmnibarSearching(true);
    setOmniCountText('Suche...');

    // Index search
    if (currentScanId) {
      try {
        const { results } = await api.searchNameIndex(currentScanId, query, { maxResults: 100 });
        if (results.length > 0) {
          setOmniResults(results);
          setOmniCountText(`${results.length} Treffer (Index)`);
          return;
        }
      } catch {}
    }

    // Deep search — clean up previous listeners first
    setDeepSearchRunning(true);
    const rootPath = currentPath.match(/^[A-Za-z]:\\/)?.[0] || currentPath;
    const collected: any[] = [];

    for (const unlisten of deepSearchUnlistenRef.current) unlisten();
    deepSearchUnlistenRef.current = [];

    const u1 = await api.onDeepSearchResult((data: any) => {
      collected.push(data);
      setOmniResults([...collected.slice(0, 200)]);
      setOmniCountText(`${collected.length} Treffer`);
    });
    const u2 = await api.onDeepSearchComplete((data: any) => {
      setDeepSearchRunning(false);
      setOmniResults(collected.slice(0, 200));
      setOmniCountText(`${data.resultCount} Treffer in ${data.dirsScanned} Ordnern`);
      for (const unlisten of deepSearchUnlistenRef.current) unlisten();
      deepSearchUnlistenRef.current = [];
    });
    const u3 = await api.onDeepSearchError(() => {
      setDeepSearchRunning(false);
      for (const unlisten of deepSearchUnlistenRef.current) unlisten();
      deepSearchUnlistenRef.current = [];
    });
    deepSearchUnlistenRef.current = [u1, u2, u3];
    api.deepSearchStart(rootPath, query, false);
  }, [entries, currentScanId, currentPath]);

  const handleAddressSubmit = useCallback((value: string) => {
    if (!value.trim()) return;
    if (/^[A-Za-z]:[\\\/]/.test(value) || value.startsWith('\\\\')) {
      setAddressMode('breadcrumb');
      setOmnibarSearching(false);
      setFilteredEntries(null);
      navigateTo(value.trim());
    } else {
      handleOmnibarSearch(value.trim());
    }
  }, [navigateTo, handleOmnibarSearch]);

  const handleOmniResultClick = useCallback((dirPath: string) => {
    setOmnibarSearching(false);
    setAddressMode('breadcrumb');
    setFilteredEntries(null);
    setOmniResults([]);
    navigateTo(dirPath);
  }, [navigateTo]);

  // Drag handlers
  const handleDragStart = useCallback((e: React.DragEvent, path: string) => {
    const paths = selectedPaths.has(path) ? [...selectedPaths] : [path];
    e.dataTransfer.setData('text/plain', JSON.stringify(paths));
    e.dataTransfer.effectAllowed = 'copyMove';
  }, [selectedPaths]);

  const handleDrop = useCallback(async (e: React.DragEvent, targetPath: string) => {
    e.preventDefault();
    let sourcePaths: string[];
    try { sourcePaths = JSON.parse(e.dataTransfer.getData('text/plain')); } catch { return; }
    sourcePaths = sourcePaths.filter(p => p !== targetPath);
    if (!sourcePaths.length) return;
    try {
      if (e.ctrlKey) await api.copy(sourcePaths, targetPath);
      else await api.move(sourcePaths, targetPath);
      refresh();
    } catch (err: any) {
      showToast('Fehler: ' + (err.message || 'Verschieben/Kopieren fehlgeschlagen'), 'error');
    }
  }, [refresh, showToast]);

  const formatDateTime = (ms: number) => {
    if (!ms) return '-';
    return new Date(ms).toLocaleString('de-DE', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  const shortenPath = (p: string) => {
    if (!p || p.length <= 45) return p;
    const parts = p.split('\\');
    if (parts.length <= 3) return p;
    return parts[0] + '\\..\\' + parts.slice(-2).join('\\');
  };

  // Keyboard handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); goBack(); }
      else if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); goForward(); }
      else if (e.altKey && e.key === 'ArrowUp') { e.preventDefault(); goUp(); }
      else if (e.key === 'F5') { e.preventDefault(); refresh(); }
      else if (e.key === 'Backspace') { e.preventDefault(); goUp(); }
      else if (e.key === 'a' && e.ctrlKey) { e.preventDefault(); selectAll(); }
      else if (e.key === 'l' && e.ctrlKey) { e.preventDefault(); setAddressMode('input'); }
      else if (e.key === 'f' && e.ctrlKey) { e.preventDefault(); setAddressMode('input'); }
      else if (e.key === 'F2' && selectedPaths.size === 1) {
        e.preventDefault();
        const path = [...selectedPaths][0];
        const entry = entries.find(en => en.path === path);
        if (entry) { setRenamePath(path); setRenameValue(entry.name); }
      }
      else if (e.key === 'x' && e.ctrlKey && selectedPaths.size > 0) {
        e.preventDefault();
        setClipboard({ paths: [...selectedPaths], cut: true });
        showToast(`${selectedPaths.size} Element(e) ausgeschnitten`, 'info');
      }
      else if (e.key === 'c' && e.ctrlKey && selectedPaths.size > 0) {
        e.preventDefault();
        setClipboard({ paths: [...selectedPaths], cut: false });
        showToast(`${selectedPaths.size} Element(e) kopiert`, 'info');
      }
      else if (e.key === 'v' && e.ctrlKey && clipboard && clipboard.paths.length > 0) {
        e.preventDefault();
        (async () => {
          try {
            if (clipboard.cut) {
              await api.move(clipboard.paths, currentPath);
              setClipboard(null);
            } else {
              await api.copy(clipboard.paths, currentPath);
            }
            showToast(`${clipboard.paths.length} Element(e) eingefügt`, 'info');
            refresh();
          } catch (err: any) { showToast('Fehler: ' + err.message, 'error'); }
        })();
      }
      else if (e.key === 'ArrowDown' && !e.altKey) {
        e.preventDefault();
        if (sortedEntries.length === 0) return;
        const currentIdx = selectedPaths.size === 1
          ? sortedEntries.findIndex(en => selectedPaths.has(en.path))
          : -1;
        const nextIdx = currentIdx < sortedEntries.length - 1 ? currentIdx + 1 : 0;
        const nextEntry = sortedEntries[nextIdx];
        if (nextEntry) {
          setSelectedPaths(new Set([nextEntry.path]));
          lastClickedRef.current = nextEntry.path;
          // Scroll into view
          const row = fileListRef.current?.querySelector(`tr[data-path="${CSS.escape(nextEntry.path)}"]`);
          row?.scrollIntoView({ block: 'nearest' });
        }
      }
      else if (e.key === 'ArrowUp' && !e.altKey) {
        e.preventDefault();
        if (sortedEntries.length === 0) return;
        const currentIdx = selectedPaths.size === 1
          ? sortedEntries.findIndex(en => selectedPaths.has(en.path))
          : sortedEntries.length;
        const prevIdx = currentIdx > 0 ? currentIdx - 1 : sortedEntries.length - 1;
        const prevEntry = sortedEntries[prevIdx];
        if (prevEntry) {
          setSelectedPaths(new Set([prevEntry.path]));
          lastClickedRef.current = prevEntry.path;
          const row = fileListRef.current?.querySelector(`tr[data-path="${CSS.escape(prevEntry.path)}"]`);
          row?.scrollIntoView({ block: 'nearest' });
        }
      }
      else if (e.key === 'Home') {
        e.preventDefault();
        if (sortedEntries.length > 0) {
          const first = sortedEntries[0];
          setSelectedPaths(new Set([first.path]));
          lastClickedRef.current = first.path;
          const row = fileListRef.current?.querySelector(`tr[data-path="${CSS.escape(first.path)}"]`);
          row?.scrollIntoView({ block: 'nearest' });
        }
      }
      else if (e.key === 'End') {
        e.preventDefault();
        if (sortedEntries.length > 0) {
          const last = sortedEntries[sortedEntries.length - 1];
          setSelectedPaths(new Set([last.path]));
          lastClickedRef.current = last.path;
          const row = fileListRef.current?.querySelector(`tr[data-path="${CSS.escape(last.path)}"]`);
          row?.scrollIntoView({ block: 'nearest' });
        }
      }
      else if (e.key === 'N' && e.ctrlKey && e.shiftKey) {
        e.preventDefault();
        setNewFolderName('');
      }
      else if (e.key === 'Delete' && selectedPaths.size > 0) {
        e.preventDefault();
        handleDelete(e.shiftKey);
      }
      else if (e.altKey && e.key === 'Enter' && selectedPaths.size > 0) {
        // Alt+Enter → Eigenschaften (wie Windows Explorer)
        e.preventDefault();
        const path = [...selectedPaths][0];
        setPropertiesPath(path);
      }
      else if (e.key === 'Enter' && !e.altKey && selectedPaths.size > 0) {
        e.preventDefault();
        const path = [...selectedPaths][0];
        const entry = entries.find(en => en.path === path);
        if (entry) handleDoubleClick(entry);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [selectedPaths, entries, sortedEntries, currentPath, clipboard, showToast, refresh, handleDelete, handleDoubleClick, goBack, goForward, goUp, selectAll, navigateTo, setPropertiesPath]);

  const breadcrumbParts = useMemo(() => {
    if (!currentPath) return [];
    const segments = currentPath.split('\\').filter(Boolean);
    let buildPath = '';
    return segments.map((s, i) => {
      buildPath += s + (i === 0 ? '\\' : '\\');
      return { name: s, path: buildPath };
    });
  }, [currentPath]);

  return (
    <div className="explorer-layout">
      {/* Quick Access Sidebar */}
      <div className="explorer-quick-access">
        <div className="explorer-qa-section">
          <div className="explorer-qa-title">Bibliothek</div>
          {knownFolders.map(folder => (
            <div key={folder.path}
              className={`explorer-qa-item ${currentPath === folder.path || currentPath.startsWith(folder.path + '\\') ? 'active' : ''}`}
              onClick={() => navigateTo(folder.path)} title={folder.path}>
              <span><QaIcon name={folder.icon} /></span>
              <span>{folder.name}</span>
            </div>
          ))}
        </div>
        <div className="explorer-qa-section">
          <div className="explorer-qa-title">Laufwerke</div>
          {drives.map(drive => (
            <div key={drive.mountpoint}
              className={`explorer-qa-item ${currentPath === drive.mountpoint || currentPath.startsWith(drive.mountpoint) ? 'active' : ''}`}
              onClick={() => navigateTo(drive.mountpoint)}
              title={`${drive.device || drive.mountpoint}${drive.free ? ` - ${formatBytes(drive.free)} frei` : ''}`}>
              <span><QaIcon name="drive" /></span>
              <span>{drive.mountpoint.replace('\\', '')}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="explorer-main">
        {/* Toolbar */}
        <div className="explorer-toolbar">
          <button className="explorer-nav-btn" title="Zurück (Alt+Links)" disabled={historyBack.length === 0} onClick={goBack}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <button className="explorer-nav-btn" title="Vor (Alt+Rechts)" disabled={historyForward.length === 0} onClick={goForward}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
          </button>
          <button className="explorer-nav-btn" title="Übergeordneter Ordner (Alt+Hoch)" onClick={goUp}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="18 15 12 9 6 15" /></svg>
          </button>
          <button className="explorer-nav-btn" title="Aktualisieren (F5)" onClick={refresh}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" /></svg>
          </button>
          <button className="explorer-nav-btn" title="Leere Ordner finden" disabled={findingEmpty} onClick={findEmptyFolders}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" /><line x1="9" y1="14" x2="15" y2="14" /></svg>
          </button>

          {/* Address Bar */}
          <div className="explorer-address-bar">
            {addressMode === 'breadcrumb' ? (
              <div className="explorer-breadcrumb-bar" onClick={() => setAddressMode('input')}>
                {breadcrumbParts.map((part, i) => (
                  <span key={i}>
                    {i > 0 && <span className="explorer-bc-sep">{'\u203A'}</span>}
                    {i === breadcrumbParts.length - 1 ? (
                      <span className="explorer-bc-current">{part.name}</span>
                    ) : (
                      <span className="explorer-bc-segment" onClick={e => { e.stopPropagation(); navigateTo(part.path); }}>{part.name}</span>
                    )}
                  </span>
                ))}
                <span className="explorer-bc-search" onClick={e => { e.stopPropagation(); setAddressMode('input'); }}>{'\uD83D\uDD0D'}</span>
              </div>
            ) : (
              <input ref={addressInputRef} type="text" className={`explorer-address-input ${omnibarSearching ? 'omnibar-search-mode' : ''}`}
                defaultValue={omnibarSearching ? '' : currentPath}
                placeholder="Pfad oder Suche eingeben..." spellCheck={false} autoFocus
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); handleAddressSubmit((e.target as HTMLInputElement).value); }
                  if (e.key === 'Escape') {
                    setAddressMode('breadcrumb');
                    setOmnibarSearching(false);
                    setFilteredEntries(null);
                    setOmniResults([]);
                    if (deepSearchRunning) { api.deepSearchCancel(); setDeepSearchRunning(false); }
                  }
                  e.stopPropagation();
                }}
                onChange={e => {
                  const val = e.target.value.trim();
                  const isSearch = val.length > 0 && !/^[A-Za-z]:[\\\/]/.test(val) && !val.startsWith('\\\\');
                  if (isSearch) {
                    clearTimeout(debounceRef.current!);
                    debounceRef.current = setTimeout(() => handleOmnibarSearch(val), 400);
                  } else if (omnibarSearching) {
                    setOmnibarSearching(false);
                    setFilteredEntries(null);
                    setOmniResults([]);
                  }
                }}
                onBlur={() => { if (!omnibarSearching) setTimeout(() => setAddressMode('breadcrumb'), 200); }}
              />
            )}
          </div>
        </div>

        {/* Omnibar Dropdown */}
        {omnibarSearching && omniResults.length > 0 && (
          <div className="explorer-omni-dropdown">
            <div className="omni-dropdown-header">
              <span className="omni-dropdown-info">{'\uD83D\uDD0D'} {omniCountText}</span>
              {deepSearchRunning && <button className="omni-dropdown-btn" onClick={() => { api.deepSearchCancel(); setDeepSearchRunning(false); }}>Stopp</button>}
            </div>
            <div className="omni-dropdown-results">
              {omniResults.map((r, i) => (
                <div key={i} className="omni-result-item" onClick={() => handleOmniResultClick(r.dirPath || r.path)}>
                  <span className="omni-result-icon"><FileIcon extension={r.isDir ? null : (r.name?.substring(r.name.lastIndexOf('.')) || '')} isDirectory={r.isDir} /></span>
                  <span className="omni-result-name">{r.name}</span>
                  <span className="omni-result-dir" title={r.dirPath}>{shortenPath(r.dirPath)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* File List */}
        <div className="explorer-file-list" ref={fileListRef}
          onContextMenu={e => { if (!(e.target as HTMLElement).closest('tr[data-path]')) handleContextMenu(e, null); }}
          onDragOver={e => { if (!(e.target as HTMLElement).closest('tr[data-path]')) { e.preventDefault(); e.dataTransfer.dropEffect = e.ctrlKey ? 'copy' : 'move'; } }}
          onDrop={e => { if (!(e.target as HTMLElement).closest('tr[data-path]')) handleDrop(e, currentPath); }}>
          {loading ? (
            <div className="explorer-loading"><div className="loading-spinner" /></div>
          ) : errorText ? (
            <div className="explorer-error">{errorText}</div>
          ) : (
            <table className="explorer-table">
              <thead>
                <tr>
                  {COLUMNS.map(col => (
                    <th key={col.id} style={{ width: columnWidthsRef.current[col.id] || col.width, textAlign: col.align }}
                      className={sortCol === col.id ? 'sort-active' : ''}
                      onClick={() => col.sortable && handleSort(col.id as SortCol)}>
                      {col.label}{col.sortable && sortCol === col.id ? (sortAsc ? ' \u25B2' : ' \u25BC') : ''}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedEntries.length === 0 ? (
                  <tr><td colSpan={5} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                    {filteredEntries !== null ? 'Keine Treffer für den Suchbegriff' : 'Dieser Ordner ist leer'}
                  </td></tr>
                ) : sortedEntries.map(entry => {
                  const isSelected = selectedPaths.has(entry.path);
                  const isTemp = !entry.isDirectory && isTempFile(entry.name, entry.extension);
                  const isEmpty = entry.isDirectory && emptyFolderPaths.has(entry.path);
                  const sizeClass = showSizeColors && entry.size > 0 ? getSizeClass(entry.size) : '';
                  const tag = dirTags[entry.path];
                  const isRenaming = renamePath === entry.path;

                  let sizeStr = '';
                  let sizePct = 0;
                  if (entry.isDirectory && entry.size > 0 && folderSizes) {
                    sizeStr = formatBytes(entry.size);
                    sizePct = parentFolderSize > 0 ? (entry.size / parentFolderSize * 100) : 0;
                  } else if (!entry.isDirectory) {
                    sizeStr = formatBytes(entry.size);
                  }

                  return (
                    <tr key={entry.path} data-path={entry.path} data-is-dir={String(entry.isDirectory)}
                      className={`${isSelected ? 'selected' : ''} ${sizeClass} ${isTemp ? 'explorer-temp-file' : ''} ${isEmpty ? 'explorer-empty-folder' : ''}`}
                      onClick={e => selectRow(entry.path, e)}
                      onDoubleClick={() => handleDoubleClick(entry)}
                      onContextMenu={e => handleContextMenu(e, entry)}
                      draggable onDragStart={e => handleDragStart(e, entry.path)}
                      onDragOver={entry.isDirectory ? e => { e.preventDefault(); e.dataTransfer.dropEffect = e.ctrlKey ? 'copy' : 'move'; (e.currentTarget as HTMLElement).classList.add('drag-over'); } : undefined}
                      onDragLeave={entry.isDirectory ? e => (e.currentTarget as HTMLElement).classList.remove('drag-over') : undefined}
                      onDrop={entry.isDirectory ? e => { (e.currentTarget as HTMLElement).classList.remove('drag-over'); handleDrop(e, entry.path); } : undefined}>
                      <td className="explorer-col-icon"><FileIcon extension={entry.extension} isDirectory={entry.isDirectory} /></td>
                      <td className={entry.isDirectory ? 'explorer-col-name dir-name' : 'explorer-col-name'} title={entry.path}>
                        {tag && <span className="explorer-tag-dot" style={{ background: TAG_COLORS[tag.color]?.hex || '#888' }} title={tag.note || tag.color} />}
                        {isRenaming ? (
                          <input type="text" className="explorer-inline-rename" value={renameValue} autoFocus aria-label="Dateiname bearbeiten"
                            onChange={e => setRenameValue(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') { e.preventDefault(); handleRename(); }
                              if (e.key === 'Escape') setRenamePath(null);
                              e.stopPropagation();
                            }}
                            onBlur={handleRename}
                            onClick={e => e.stopPropagation()} />
                        ) : entry.name}
                        {isTemp && <span className="explorer-temp-badge">Temp</span>}
                        {isEmpty && <span className="explorer-empty-badge">Leer</span>}
                      </td>
                      <td className="explorer-col-size">
                        {sizeStr}
                        {sizePct > 0 && (
                          <div className="explorer-size-bar">
                            <div className="size-bar">
                              <div className="size-bar-fill" style={{ width: `${Math.max(sizePct, 0.5)}%` }} />
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="explorer-col-type">{entry.isDirectory ? 'Ordner' : (entry.extension || '-')}</td>
                      <td className="explorer-col-date">{formatDateTime(entry.modified)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Status Bar */}
        <div className="explorer-status">
          {selectedPaths.size > 0 ? (
            <>
              <span className="explorer-status-count">{selectedPaths.size} ausgewählt</span>
              <span>{formatBytes(entries.filter(e => selectedPaths.has(e.path) && !e.isDirectory).reduce((s, e) => s + e.size, 0))}</span>
            </>
          ) : (
            <span>{statusText}</span>
          )}
        </div>
      </div>

      {/* Context Menu */}
      {ctxMenu && (() => {
        const entry = ctxMenu.entry;
        const multi = selectedPaths.size > 1;
        const isDir = entry?.isDirectory;
        const ext = entry?.extension?.toLowerCase() || '';
        const isArchive = ['.zip', '.7z', '.rar', '.tar', '.gz', '.bz2', '.xz', '.tar.gz', '.tgz'].includes(ext);
        const isPdf = ext === '.pdf';
        const isExecutable = ['.exe', '.msi', '.bat', '.cmd', '.ps1'].includes(ext);
        const isTextFile = ['.txt', '.log', '.md', '.json', '.xml', '.csv', '.ini', '.cfg', '.yaml', '.yml',
          '.bat', '.cmd', '.ps1', '.py', '.js', '.ts', '.jsx', '.tsx', '.html', '.htm', '.css', '.scss',
          '.java', '.c', '.cpp', '.h', '.cs', '.rb', '.go', '.rs', '.php', '.sql', '.sh', '.toml', '.env',
          '.gitignore', '.editorconfig', '.properties', '.conf', '.reg'].includes(ext);
        const hasTag = entry ? !!dirTags[entry.path] : false;
        return (
          <div className="explorer-ctx-menu" style={{ left: ctxMenu.x, top: ctxMenu.y }} onClick={e => e.stopPropagation()}>
            {entry ? (
              <>
                <button className="ctx-item ctx-item-bold" onClick={() => ctxAction('open')}>Öffnen</button>
                {isPdf && (
                  <button className="ctx-item" onClick={() => ctxAction('open-system-default')}>Mit Standardprogramm öffnen</button>
                )}
                {!isDir && <button className="ctx-item" onClick={() => ctxAction('open-with')}>Öffnen mit...</button>}
                {(isTextFile || (!isDir && ext === '')) && (
                  <button className="ctx-item" onClick={() => ctxAction('edit')}>Bearbeiten</button>
                )}
                {isExecutable && (
                  <button className="ctx-item" onClick={() => ctxAction('run-as-admin')}>Als Administrator ausführen</button>
                )}
                <div className="ctx-separator" />
                <button className="ctx-item" onClick={() => ctxAction('open-in-explorer')}>Im Explorer anzeigen</button>
                <button className="ctx-item" onClick={() => ctxAction('open-terminal')}>Terminal hier öffnen</button>
                <div className="ctx-separator" />
                <button className="ctx-item" onClick={() => ctxAction('cut')}>Ausschneiden <span className="ctx-shortcut">Strg+X</span></button>
                <button className="ctx-item" onClick={() => ctxAction('copy-files')}>Kopieren <span className="ctx-shortcut">Strg+C</span></button>
                {clipboard && clipboard.paths.length > 0 && (
                  <button className="ctx-item" onClick={() => ctxAction(isDir ? 'paste-into' : 'paste')}>
                    {isDir ? 'Hier einfügen' : 'Einfügen'} <span className="ctx-shortcut">Strg+V</span>
                  </button>
                )}
                <div className="ctx-separator" />
                <button className="ctx-item" onClick={() => ctxAction('copy-path')}>Pfad kopieren</button>
                {!multi && <button className="ctx-item" onClick={() => ctxAction('rename')}>Umbenennen <span className="ctx-shortcut">F2</span></button>}
                <div className="ctx-separator" />
                <button className="ctx-item" onClick={() => ctxAction('move-to')}>Verschieben nach...</button>
                <button className="ctx-item" onClick={() => ctxAction('copy-to')}>Kopieren nach...</button>
                <div className="ctx-separator" />
                {!isArchive && <button className="ctx-item" onClick={() => ctxAction('create-zip')}>Als ZIP komprimieren</button>}
                {isArchive && <button className="ctx-item" onClick={() => ctxAction('extract')}>Archiv entpacken</button>}
                {!multi && (
                  <>
                    <div className="ctx-separator" />
                    <div className="ctx-submenu-trigger">
                      <button className="ctx-item">Tag setzen ›</button>
                      <div className="ctx-submenu">
                        {['red', 'orange', 'yellow', 'green', 'blue', 'purple'].map(c => (
                          <button key={c} className="ctx-item ctx-tag-item" onClick={() => ctxAction('tag-' + c)}>
                            <span className="ctx-tag-dot" style={{ background: TAG_COLORS[c]?.hex || '#888' }} />
                            {TAG_COLORS[c]?.label || c}
                          </button>
                        ))}
                        {hasTag && <>
                          <div className="ctx-separator" />
                          <button className="ctx-item" onClick={() => ctxAction('tag-remove')}>Tag entfernen</button>
                        </>}
                      </div>
                    </div>
                  </>
                )}
                <div className="ctx-separator" />
                <button className="ctx-item" onClick={() => ctxAction('trash')}>In Papierkorb <span className="ctx-shortcut">Entf</span></button>
                <button className="ctx-item ctx-item-danger" onClick={() => ctxAction('delete-permanent')}>Endgültig löschen <span className="ctx-shortcut">Shift+Entf</span></button>
                <div className="ctx-separator" />
                <button className="ctx-item" onClick={() => ctxAction('properties')}>Eigenschaften <span className="ctx-shortcut">Alt+Enter</span></button>
              </>
            ) : (
              <>
                <div className="ctx-submenu-trigger">
                  <button className="ctx-item">Ansicht ›</button>
                  <div className="ctx-submenu">
                    <button className="ctx-item" onClick={() => { /* Platzhalter für Ansicht-Modi */ }}>Details</button>
                  </div>
                </div>
                <div className="ctx-submenu-trigger">
                  <button className="ctx-item">Sortieren nach ›</button>
                  <div className="ctx-submenu">
                    <button className={`ctx-item ${sortCol === 'name' ? 'ctx-item-active' : ''}`} onClick={() => { setCtxMenu(null); handleSort('name'); }}>Name</button>
                    <button className={`ctx-item ${sortCol === 'size' ? 'ctx-item-active' : ''}`} onClick={() => { setCtxMenu(null); handleSort('size'); }}>Größe</button>
                    <button className={`ctx-item ${sortCol === 'type' ? 'ctx-item-active' : ''}`} onClick={() => { setCtxMenu(null); handleSort('type'); }}>Typ</button>
                    <button className={`ctx-item ${sortCol === 'modified' ? 'ctx-item-active' : ''}`} onClick={() => { setCtxMenu(null); handleSort('modified'); }}>Änderungsdatum</button>
                  </div>
                </div>
                <button className="ctx-item" onClick={() => ctxAction('refresh')}>Aktualisieren <span className="ctx-shortcut">F5</span></button>
                <div className="ctx-separator" />
                <button className="ctx-item" onClick={() => ctxAction('new-folder')}>Neuer Ordner <span className="ctx-shortcut">Strg+Shift+N</span></button>
                <button className="ctx-item" onClick={() => ctxAction('new-textfile')}>Neues Textdokument</button>
                <div className="ctx-separator" />
                {clipboard && clipboard.paths.length > 0 && (
                  <>
                    <button className="ctx-item" onClick={() => ctxAction('paste')}>Einfügen <span className="ctx-shortcut">Strg+V</span></button>
                    <div className="ctx-separator" />
                  </>
                )}
                <button className="ctx-item" onClick={() => ctxAction('open-terminal')}>Terminal hier öffnen</button>
                <button className="ctx-item" onClick={() => ctxAction('open-in-explorer')}>Im Explorer öffnen</button>
                <div className="ctx-separator" />
                <button className="ctx-item" onClick={() => ctxAction('folder-properties')}>Eigenschaften <span className="ctx-shortcut">Alt+Enter</span></button>
              </>
            )}
          </div>
        );
      })()}

      {/* New Folder Dialog */}
      {newFolderName !== null && (
        <div className="explorer-new-folder-overlay" onClick={() => setNewFolderName(null)}>
          <div className="explorer-new-folder-dialog" onClick={e => e.stopPropagation()}>
            <h3>Neuer Ordner</h3>
            <input type="text" value={newFolderName} autoFocus placeholder="Ordnername..."
              aria-label="Neuer Ordnername"
              onChange={e => setNewFolderName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleNewFolder();
                if (e.key === 'Escape') setNewFolderName(null);
              }}
            />
            <div className="explorer-new-folder-actions">
              <button onClick={() => setNewFolderName(null)}>Abbrechen</button>
              <button className="primary" onClick={handleNewFolder}>Erstellen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
