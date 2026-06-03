import type { Editor, TLPageId } from 'tldraw';
import { v4 as uuid } from 'uuid';
import { getPageIndex, setPageIndex, incrementPageIndex } from '../utils/constants';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CollabKitClient = any;

export interface PageInfo {
  id: string;
  name: string;
}

/**
 * Load existing page metadata from the CollabKit pages store.
 * Returns the list of pages and the current page (if any).
 */
export function loadExistingPages(
  editor: Editor,
  allEntries: Record<string, { data: string }>
): { pages: PageInfo[]; currentPage: PageInfo | null } {
  const pages: PageInfo[] = [];
  let currentPage: PageInfo | null = null;

  for (const [key, value] of Object.entries(allEntries)) {
    try {
      const pageData = JSON.parse(value.data) as PageInfo;

      if (key === 'currentPage') {
        currentPage = pageData;
        continue;
      }

      // Create page in tldraw if it doesn't exist
      const existing = editor.getPage(pageData.id as TLPageId);
      if (!existing) {
        editor.createPage({ name: pageData.name, id: pageData.id as TLPageId });
      }
      pages.push(pageData);

      // Track page index counter
      const match = pageData.name.match(/Page (\d+)/);
      if (match) {
        const idx = parseInt(match[1], 10);
        if (!isNaN(idx) && idx >= getPageIndex()) {
          setPageIndex(idx);
        }
      }
    } catch (err) {
      console.error('[pagination] Failed to parse page entry:', err);
    }
  }

  // Navigate to current page if specified
  if (currentPage) {
    const page = editor.getPage(currentPage.id as TLPageId);
    if (page) {
      editor.setCurrentPage(currentPage.id as TLPageId);
    }
  }

  return { pages, currentPage };
}

/**
 * Attach inbound page change listener.
 * Returns a cleanup function.
 */
export function attachPageSync(
  editor: Editor,
  client: CollabKitClient,
  callbacks: {
    onPagesChanged: (pages: PageInfo[]) => void;
    onCurrentPageChanged: (page: PageInfo) => void;
  }
): () => void {
  return client.stores.pages.on(
    'changed',
    (event: { key: string; action: string; value: { data: string } | null }) => {
      try {
        if (event.key === 'currentPage' && event.value) {
          const pageData = JSON.parse(event.value.data) as PageInfo;
          const existing = editor.getPage(pageData.id as TLPageId);
          if (existing) {
            editor.setCurrentPage(pageData.id as TLPageId);
          } else {
            editor.createPage({ name: pageData.name, id: pageData.id as TLPageId });
          }
          callbacks.onCurrentPageChanged(pageData);
          return;
        }

        if (event.action === 'delete' || !event.value) {
          try { editor.deletePage(event.key as TLPageId); } catch { /* page may not exist */ }
          syncPagesFromEditor(editor, callbacks);
          return;
        }

        if (event.action === 'set') {
          const pageData = JSON.parse(event.value.data) as PageInfo;
          const existing = editor.getPage(pageData.id as TLPageId);
          if (!existing) {
            editor.createPage({ name: pageData.name, id: pageData.id as TLPageId });
            incrementPageIndex();
          }
          syncPagesFromEditor(editor, callbacks);
        }
      } catch (err) {
        console.error('[pagination] Failed to handle page change:', err);
      }
    }
  );
}

/**
 * Create page CRUD controls.
 */
export function createPageControls(
  editor: Editor,
  client: CollabKitClient,
  callbacks: {
    onPagesChanged: (pages: PageInfo[]) => void;
    onCurrentPageChanged: (page: PageInfo) => void;
  }
): {
  addPage: () => Promise<void>;
  deletePage: (pageId: string) => Promise<void>;
  switchPage: (pageId: string) => void;
} {
  const addPage = async (): Promise<void> => {
    try {
      const index = incrementPageIndex();
      const pageId = `page:${uuid()}` as TLPageId;
      const pageName = `Page ${index}`;
      const pageInfo: PageInfo = { id: pageId, name: pageName };

      editor.createPage({ name: pageName, id: pageId });
      editor.setCurrentPage(pageId);

      await client.stores.pages.set({
        key: pageId,
        value: { data: JSON.stringify(pageInfo) },
      });
      await client.stores.pages.set({
        key: 'currentPage',
        value: { data: JSON.stringify(pageInfo) },
      });

      syncPagesFromEditor(editor, callbacks);
      callbacks.onCurrentPageChanged(pageInfo);
    } catch (err) {
      console.error('[pagination] addPage failed:', err);
    }
  };

  const deletePage = async (pageId: string): Promise<void> => {
    try {
      if (editor.getPages().length <= 1) return;

      editor.deletePage(pageId as TLPageId);

      const currentPageId = editor.getCurrentPageId();
      const currentEditorPage = editor.getPage(currentPageId);
      const currentPageInfo: PageInfo = {
        id: currentPageId,
        name: currentEditorPage?.name || 'Page 1',
      };

      await client.stores.pages.delete({ key: pageId });
      await client.stores.pages.set({
        key: 'currentPage',
        value: { data: JSON.stringify(currentPageInfo) },
      });

      syncPagesFromEditor(editor, callbacks);
      callbacks.onCurrentPageChanged(currentPageInfo);
    } catch (err) {
      console.error('[pagination] deletePage failed:', err);
    }
  };

  const switchPage = (pageId: string): void => {
    try {
      editor.setCurrentPage(pageId as TLPageId);
      const page = editor.getPage(pageId as TLPageId);
      if (!page) return;

      const pageInfo: PageInfo = { id: page.id, name: page.name };
      client.stores.pages
        .set({ key: 'currentPage', value: { data: JSON.stringify(pageInfo) } })
        .catch((err: Error) => console.error('[pagination] switchPage sync failed:', err));

      callbacks.onCurrentPageChanged(pageInfo);
    } catch (err) {
      console.error('[pagination] switchPage failed:', err);
    }
  };

  return { addPage, deletePage, switchPage };
}

function syncPagesFromEditor(
  editor: Editor,
  callbacks: { onPagesChanged: (pages: PageInfo[]) => void }
): void {
  const editorPages = editor.getPages();
  const pageInfos: PageInfo[] = editorPages.map((p) => ({ id: p.id, name: p.name }));
  callbacks.onPagesChanged(pageInfos);
}
