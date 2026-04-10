import React, { useState, useRef, useEffect } from 'react';
import { Folder, FolderOpen, FileText, Upload, Plus, Search, ChevronRight, ChevronUp, ChevronDown, Info, Trash2, MoreVertical, Download, Edit2, RotateCcw, X, Archive } from 'lucide-react';
import { DocumentArchive, Fascicolo, db } from '../db/database';

interface WorkDriveArchiveProps {
  fascicoli: Fascicolo[];
  fascicoloDocuments: DocumentArchive[];
  activeFascicoloId: number | null;
  setActiveFascicoloId: (id: number | null) => void;
  handleCreateFascicolo: () => void;
  handleCreateSubFascicolo: (parentId: number) => void;
  handleUpload: (file: File) => void;
  handleMoveOrCopy: (docId: number, targetFascicoloId: number, action: 'move' | 'copy') => void;
  handleMoveFascicolo: (fascicoloId: number, targetFascicoloId: number) => void;
  handleDeleteDocument: (docId: number) => void;
  handleRenameDocument: (docId: number, newName: string) => void;
  handleRenameFascicolo: (fascicoloId: number, newName: string) => void;
  handleDeleteFascicolo: (fascicoloId: number) => void;
  trashDocuments: DocumentArchive[];
  trashFascicoli: Fascicolo[];
  handleRecover: (type: 'document' | 'fascicolo', id: number) => void;
  playAudio: (text: string) => Promise<void>;
}

export default function WorkDriveArchive({
  fascicoli,
  fascicoloDocuments,
  activeFascicoloId,
  setActiveFascicoloId,
  handleCreateFascicolo,
  handleCreateSubFascicolo,
  handleUpload,
  handleMoveOrCopy,
  handleMoveFascicolo,
  handleDeleteDocument,
  handleRenameDocument,
  handleRenameFascicolo,
  handleDeleteFascicolo,
  trashDocuments,
  trashFascicoli,
  handleRecover,
  playAudio
}: WorkDriveArchiveProps) {
  const [selectedDocId, setSelectedDocId] = useState<number | null>(null);
  const [summaryModal, setSummaryModal] = useState<{ show: boolean, doc: DocumentArchive | null }>({ show: false, doc: null });
  const [draggedDoc, setDraggedDoc] = useState<DocumentArchive | null>(null);
  const [draggedFascicolo, setDraggedFascicolo] = useState<Fascicolo | null>(null);
  const activeFascicolo = fascicoli.find(f => f.id === activeFascicoloId);
  const [highlightedFascicoloId, setHighlightedFascicoloId] = useState<number | null>(null);
  const [activeView, setActiveView] = useState<'folder' | 'trash'>('folder');
  const [modalState, setModalState] = useState<{ show: boolean, doc: DocumentArchive | null, targetFascicolo: Fascicolo | null }>({ show: false, doc: null, targetFascicolo: null });

  const [expandedFascicoli, setExpandedFascicoli] = useState<Set<number>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollInterval = useRef<NodeJS.Timeout | null>(null);
  const [showUpArrow, setShowUpArrow] = useState(false);
  const [showDownArrow, setShowDownArrow] = useState(false);

  const checkScroll = () => {
    if (scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      setShowUpArrow(scrollTop > 10);
      setShowDownArrow(scrollTop + clientHeight < scrollHeight - 10);
    }
  };

  useEffect(() => {
    checkScroll();
    // Also check on window resize
    window.addEventListener('resize', checkScroll);
    return () => window.removeEventListener('resize', checkScroll);
  }, [fascicoli, expandedFascicoli]);

  const startScrolling = (direction: 'up' | 'down') => {
    if (scrollInterval.current) return;
    scrollInterval.current = setInterval(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollBy({ top: direction === 'up' ? -15 : 15 });
        checkScroll();
      }
    }, 30);
  };

  const stopScrolling = () => {
    if (scrollInterval.current) {
      clearInterval(scrollInterval.current);
      scrollInterval.current = null;
    }
  };

  const toggleExpand = (id: number) => {
    const next = new Set(expandedFascicoli);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedFascicoli(next);
  };

  const renderFascicolo = (f: Fascicolo, level: number = 0, isLast: boolean = true) => {
    const children = subFascicoli.filter(sub => sub.parentId === f.id).sort((a, b) => a.name.localeCompare(b.name));
    const isExpanded = expandedFascicoli.has(f.id!);
    const isSub = level > 0;
    
    // Limit to 3 levels
    if (level > 2) return null;

    const getFolderIcon = (lvl: number, isActive: boolean) => {
      if (lvl === 0) return isActive ? <FolderOpen className="w-5 h-5 text-blue-700 fill-blue-200" /> : <Folder className="w-5 h-5 text-blue-500" />;
      if (lvl === 1) return isActive ? <FolderOpen className="w-5 h-5 text-amber-700 fill-amber-200" /> : <FolderOpen className="w-5 h-5 text-amber-500" />;
      return <FileText className="w-5 h-5 text-green-500" />;
    };

    return (
      <div key={f.id} className="relative">
        {isSub && (
          <div 
            className={`absolute top-0 border-l-2 border-dashed border-gray-400 ${isLast ? 'h-6' : 'bottom-0'}`} 
            style={{ left: `${(level - 1) * 16 + 40}px` }} 
          />
        )}
        {isSub && (
          <div className="absolute top-5 w-4 border-t-2 border-dashed border-gray-400" style={{ left: `${(level - 1) * 16 + 40}px` }} />
        )}
        {isSub && (
          <div className="absolute top-[18px] w-1.5 h-1.5 border-t-2 border-r-2 border-gray-600 rotate-45" style={{ left: `${(level - 1) * 16 + 52}px` }} />
        )}
        <div 
          className={`w-full flex items-center justify-between rounded group ${activeFascicoloId === f.id ? 'bg-blue-50 text-blue-700 font-semibold' : 'hover:bg-gray-100'} ${highlightedFascicoloId === f.id ? 'bg-blue-200' : ''}`}
          style={{ paddingLeft: `${level * 16 + 4 + (level > 0 ? 8 : 0)}px` }}
          draggable
          onDragStart={(e) => { e.stopPropagation(); setDraggedFascicolo(f); }}
          onDragEnd={() => setDraggedFascicolo(null)}
          onDragOver={(e) => { e.preventDefault(); setHighlightedFascicoloId(f.id!); }}
          onDragLeave={() => setHighlightedFascicoloId(null)}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setHighlightedFascicoloId(null);
            if (draggedDoc) {
              setModalState({ show: true, doc: draggedDoc, targetFascicolo: f });
              setDraggedDoc(null);
            } else if (draggedFascicolo && draggedFascicolo.id !== f.id) {
              handleMoveFascicolo(draggedFascicolo.id!, f.id!);
              setDraggedFascicolo(null);
            }
          }}
        >
          <div className="flex items-center flex-grow">
            <button onClick={() => toggleExpand(f.id!)} className="p-1 hover:bg-gray-200 rounded">
              <ChevronRight className={`w-4 h-4 transition-transform text-gray-600 ${isExpanded ? 'rotate-90' : ''} ${children.length === 0 ? 'opacity-0' : 'opacity-100'}`} />
            </button>
            <button 
              onClick={() => { setActiveView('folder'); setActiveFascicoloId(f.id!); }}
              className="flex-grow text-left px-1 py-2 flex items-center gap-2"
            >
              {getFolderIcon(level, activeFascicoloId === f.id)} {f.name}
            </button>
          </div>
          <div className="hidden group-hover:flex gap-1 pr-2">
            <button onClick={() => handleCreateSubFascicolo(f.id!)} className="p-1 hover:bg-gray-200 rounded-full text-gray-500"><Plus className="w-3 h-3" /></button>
            <button onClick={() => {
              const newName = prompt("Nuovo nome:", f.name);
              if (newName) handleRenameFascicolo(f.id!, newName);
            }} className="p-1 hover:bg-gray-200 rounded text-gray-500"><Edit2 className="w-3 h-3" /></button>
            <button onClick={() => {
              if (confirm(`Sei sicuro di voler eliminare il fascicolo ${f.name}?`)) handleDeleteFascicolo(f.id!);
            }} className="p-1 hover:bg-gray-200 rounded text-red-500"><Trash2 className="w-3 h-3" /></button>
          </div>
        </div>
        {isExpanded && children.map((child, index) => renderFascicolo(child, level + 1, index === children.length - 1))}
      </div>
    );
  };

  const rootFascicoli = fascicoli.filter(f => !f.parentId);
  const subFascicoli = fascicoli.filter(f => f.parentId);

  const sortedRoot = [...rootFascicoli].sort((a, b) => a.name.localeCompare(b.name));

  const downloadFile = (doc: DocumentArchive) => {
    const byteCharacters = atob(doc.originalFileBase64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: doc.fileMimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = doc.fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex h-full bg-white text-gray-800 overflow-hidden">
      {/* Sidebar */}
      <div className="w-72 bg-gray-50 border-r flex flex-col relative group/sidebar shrink-0">
        <div className="p-4 font-bold text-lg border-b flex justify-between items-center bg-white z-20">
          <div className="flex items-center gap-2">
            <Archive className="w-5 h-5 text-blue-600" />
            <span>WorkDrive</span>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={handleCreateFascicolo} 
              className="text-blue-600 hover:bg-blue-600 hover:text-white rounded-full p-1 border border-blue-600 transition-all"
              title="Nuovo Fascicolo"
            >
              <Plus className="w-4 h-4" />
            </button>
            <button onClick={() => setActiveView('trash')} className="text-gray-400 hover:text-red-500 transition-colors" title="Cestino">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="relative flex-grow overflow-hidden flex flex-col">
          {/* Up Arrow Overlay */}
          <div 
            className={`absolute top-0 left-0 right-0 z-30 h-12 bg-gradient-to-b from-gray-50 to-transparent flex items-start justify-center cursor-pointer transition-opacity duration-300 ${showUpArrow ? ((draggedDoc || draggedFascicolo) ? 'opacity-100' : 'opacity-0 group-hover/sidebar:opacity-100') : 'opacity-0 pointer-events-none'}`}
            onMouseEnter={() => startScrolling('up')}
            onMouseLeave={stopScrolling}
            onDragOver={(e) => {
              e.preventDefault();
              startScrolling('up');
            }}
            onDragLeave={stopScrolling}
          >
            <ChevronUp className="w-6 h-6 text-blue-600 mt-1 animate-bounce" />
          </div>

          <nav 
            ref={scrollRef}
            onScroll={checkScroll}
            className="flex-grow overflow-y-auto no-scrollbar p-3 space-y-1"
          >
            {sortedRoot.map(f => renderFascicolo(f))}
          </nav>

          {/* Down Arrow Overlay */}
          <div 
            className={`absolute bottom-0 left-0 right-0 z-30 h-12 bg-gradient-to-t from-gray-50 to-transparent flex items-end justify-center cursor-pointer transition-opacity duration-300 ${showDownArrow ? ((draggedDoc || draggedFascicolo) ? 'opacity-100' : 'opacity-0 group-hover/sidebar:opacity-100') : 'opacity-0 pointer-events-none'}`}
            onMouseEnter={() => startScrolling('down')}
            onMouseLeave={stopScrolling}
            onDragOver={(e) => {
              e.preventDefault();
              startScrolling('down');
            }}
            onDragLeave={stopScrolling}
          >
            <ChevronDown className="w-6 h-6 text-blue-600 mb-1 animate-bounce" />
          </div>
        </div>
      </div>

      {/* Main Area */}
      <div className="flex-grow flex flex-col">
        {/* Toolbar */}
        <div className="p-3 border-b flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <span className="cursor-pointer hover:text-blue-600 transition-colors" onClick={() => { setActiveView('folder'); setActiveFascicoloId(null); }}>I Miei File</span>
            {activeView === 'trash' && <><ChevronRight className="w-4 h-4" /> <span className="font-bold text-lg text-red-600">Cestino</span></>}
            {activeView === 'folder' && activeFascicolo && <><ChevronRight className="w-4 h-4" /> <span className="font-bold text-lg text-blue-700">{activeFascicolo.name}</span></>}
          </div>
          <div className="flex gap-2">
            <input type="file" id="file-upload" className="hidden" onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])} />
            <label htmlFor="file-upload" className="p-2 rounded hover:bg-gray-100 cursor-pointer"><Upload className="w-5 h-5" /></label>
            <button className="p-2 rounded hover:bg-gray-100"><Search className="w-5 h-5" /></button>
          </div>
        </div>

        {/* File List */}
        <div className="flex-grow overflow-y-auto p-4">
          {activeView === 'folder' ? (
            <table className="w-full text-sm">
              <thead className="border-b">
                <tr className="text-left text-gray-500">
                  <th className="p-2">Nome</th>
                  <th className="p-2">Data</th>
                  <th className="p-2">Categoria</th>
                  <th className="p-2">AI</th>
                </tr>
              </thead>
              <tbody>
                {fascicoloDocuments.map(doc => (
                  <tr 
                    key={doc.id} 
                    draggable
                    onDragStart={() => setDraggedDoc(doc)}
                    onDragEnd={() => setDraggedDoc(null)}
                    className={`border-b hover:bg-gray-50 cursor-pointer ${selectedDocId === doc.id ? 'bg-blue-50' : ''}`}
                    onClick={() => setSelectedDocId(doc.id!)}
                  >
                    <td className="p-2 flex items-center gap-2">
                      <FileText className="w-4 h-4 text-blue-500" /> 
                      <span className="cursor-pointer hover:text-blue-700" onClick={() => {
                        const blob = new Blob([new Uint8Array(atob(doc.originalFileBase64).split('').map(c => c.charCodeAt(0)))], { type: doc.fileMimeType });
                        const url = URL.createObjectURL(blob);
                        window.open(url, '_blank');
                      }}>
                        {doc.fileName}
                      </span>
                    </td>
                    <td className="p-2">{doc.createdAt.toLocaleString()}</td>
                    <td className="p-2">{doc.category}</td>
                    <td className="p-2">
                      <button className="text-purple-500 hover:text-purple-700" title="Sintesi AI" onClick={() => setSummaryModal({ show: true, doc })}>
                        <Info className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="space-y-2">
              {trashFascicoli.length === 0 && trashDocuments.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                  <Trash2 className="w-12 h-12 mb-2 opacity-20" />
                  <p>Il cestino è vuoto</p>
                </div>
              )}
              {trashFascicoli.map(f => (
                <div key={f.id} className="flex items-center justify-between p-2 text-sm text-gray-600 border-b">
                  {f.name} (Fascicolo)
                  <button onClick={() => handleRecover('fascicolo', f.id!)} className="text-green-600">Recupera</button>
                </div>
              ))}
              {trashDocuments.map(d => (
                <div 
                  key={d.id} 
                  draggable
                  onDragStart={() => setDraggedDoc(d)}
                  onDragEnd={() => setDraggedDoc(null)}
                  className="flex items-center justify-between p-2 text-sm text-gray-600 border-b cursor-grab hover:bg-gray-50"
                >
                  {d.fileName}
                  <div className="flex gap-2">
                    <button onClick={() => handleRecover('document', d.id!)} className="text-green-600 hover:text-green-800" title="Recupera">
                      <RotateCcw className="w-4 h-4" />
                    </button>
                    <button onClick={async () => {
                      if (confirm("Eliminare definitivamente?")) {
                        await db.documents.delete(d.id!);
                        // Since we are in a component, we should ideally call a refresh function 
                        // passed from props, but for now we'll use handleRecover logic style
                        // or a local state update if we had one. 
                        // To be safe and immediate, we'll use a reload or better, 
                        // the parent should be listening to DB changes.
                        // However, the user asked for immediate update.
                        window.location.reload();
                      }
                    }} className="text-red-600 hover:text-red-800" title="Elimina definitivamente">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Details Panel */}
      {selectedDocId && (
        <div className="w-64 border-l p-4 bg-gray-50">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold">Dettagli</h3>
            <div className="flex gap-2">
              <button onClick={() => {
                const doc = fascicoloDocuments.find(d => d.id === selectedDocId);
                if (doc) downloadFile(doc);
              }} className="text-blue-500"><Download className="w-4 h-4" /></button>
              <button onClick={() => {
                const doc = fascicoloDocuments.find(d => d.id === selectedDocId);
                if (doc) {
                  const newName = prompt("Nuovo nome:", doc.fileName);
                  if (newName) handleRenameDocument(doc.id!, newName);
                }
              }} className="text-gray-500"><Edit2 className="w-4 h-4" /></button>
              <button onClick={() => {
                if (selectedDocId) {
                  handleDeleteDocument(selectedDocId);
                  setSelectedDocId(null);
                }
              }} className="text-red-500"><Trash2 className="w-4 h-4" /></button>
              <button onClick={() => setSelectedDocId(null)}><Info className="w-4 h-4" /></button>
            </div>
          </div>
          {fascicoloDocuments.find(d => d.id === selectedDocId) && (
            <div className="space-y-2 text-sm">
              <p><strong>Nome:</strong> {fascicoloDocuments.find(d => d.id === selectedDocId)?.fileName}</p>
              <p><strong>Creato:</strong> {fascicoloDocuments.find(d => d.id === selectedDocId)?.createdAt.toLocaleString()}</p>
              <p><strong>Categoria:</strong> {fascicoloDocuments.find(d => d.id === selectedDocId)?.category}</p>
            </div>
          )}
        </div>
      )}
      {summaryModal.show && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-8 rounded-2xl shadow-2xl max-w-lg w-full">
            <h2 className="text-xl font-bold mb-4 text-gray-800">Sintesi AI</h2>
            <div className="text-gray-700 mb-6 whitespace-pre-wrap">{summaryModal.doc?.summary || "Nessuna sintesi disponibile."}</div>
            <div className="flex gap-4 justify-center">
              <button 
                onClick={() => playAudio(summaryModal.doc?.summary || "Nessuna sintesi disponibile.")} 
                className="bg-blue-600 text-white px-6 py-2 rounded-xl hover:bg-blue-700"
              >
                Ascolta
              </button>
              <button 
                onClick={() => setSummaryModal({ show: false, doc: null })} 
                className="bg-gray-100 px-6 py-2 rounded-xl hover:bg-gray-200"
              >
                Chiudi
              </button>
            </div>
          </div>
        </div>
      )}
      {modalState.show && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-8 rounded-2xl shadow-2xl max-w-sm w-full">
            <h2 className="text-xl font-bold mb-6 text-gray-800 text-center">Trasferimento File</h2>
            <p className="mb-8 text-gray-600 text-center">
              Cosa desideri fare con <strong>{modalState.doc?.fileName}</strong> verso <strong>{modalState.targetFascicolo?.name}</strong>?
            </p>
            <div className="flex gap-4 justify-center">
              <button 
                onClick={() => { handleMoveOrCopy(modalState.doc!.id!, modalState.targetFascicolo!.id!, 'move'); setModalState({ show: false, doc: null, targetFascicolo: null }); }} 
                className="flex flex-col items-center gap-2 bg-blue-50 hover:bg-blue-100 text-blue-700 px-6 py-4 rounded-xl transition-all"
              >
                <RotateCcw className="w-8 h-8" />
                <span>Sposta</span>
              </button>
              <button 
                onClick={() => { handleMoveOrCopy(modalState.doc!.id!, modalState.targetFascicolo!.id!, 'copy'); setModalState({ show: false, doc: null, targetFascicolo: null }); }} 
                className="flex flex-col items-center gap-2 bg-green-50 hover:bg-green-100 text-green-700 px-6 py-4 rounded-xl transition-all"
              >
                <Plus className="w-8 h-8" />
                <span>Copia</span>
              </button>
              <button 
                onClick={() => setModalState({ show: false, doc: null, targetFascicolo: null })} 
                className="bg-gray-100 hover:bg-gray-200 text-gray-600 px-6 py-4 rounded-xl transition-all"
              >
                Annulla
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
