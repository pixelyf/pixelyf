const DB_NAME = 'pixelyf_galaxy_db'
const STORE_NAME = 'galaxy_cache'
const VERSION = 1

// [PERF] 싱글톤 DB 인스턴스 — 매 호출마다 indexedDB.open() 방지
let _dbInstance: IDBDatabase | null = null

export const getDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') return reject(new Error('No window'))
    if (_dbInstance) return resolve(_dbInstance)

    const request = indexedDB.open(DB_NAME, VERSION)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      _dbInstance = request.result
      // [MULTI-TAB] 다른 탭에서 DB 버전 업그레이드 시 stale 커넥션 방지
      _dbInstance.onversionchange = () => {
        _dbInstance?.close()
        _dbInstance = null
      }
      _dbInstance.onclose = () => { _dbInstance = null }
      resolve(_dbInstance)
    }
    request.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
  })
}

export const idbSet = async (key: string, value: any): Promise<void> => {
  try {
    const db = await getDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const req = store.put(value, key)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  } catch (err) {
    console.warn('[IDB] set error', err)
  }
}

export const idbGet = async <T>(key: string): Promise<T | null> => {
  try {
    const db = await getDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const req = store.get(key)
      req.onsuccess = () => resolve((req.result as T) || null)
      req.onerror = () => reject(req.error)
    })
  } catch (err) {
    console.warn('[IDB] get error', err)
    return null
  }
}

export const idbDelete = async (key: string): Promise<void> => {
  try {
    const db = await getDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const req = store.delete(key)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  } catch (err) {
    console.warn('[IDB] delete error', err)
  }
}

export const idbClear = async (): Promise<void> => {
  try {
    const db = await getDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const req = store.clear()
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  } catch (err) {
    console.warn('[IDB] clear error', err)
  }
}
