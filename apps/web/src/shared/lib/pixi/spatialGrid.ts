/**
 * SpatialGrid에 삽입될 데이터의 최소 인터페이스.
 * 엔진 레이어에서 비즈니스 데이터 모델(PixelData)을 직접 참조하지 않고,
 * 좌표와 ID만 요구하는 추상 인터페이스를 통해 결합도를 제거합니다.
 */
export interface PixelDataLike {
  pixelId: string
  coordX: number
  coordY: number
}

export class SpatialGrid<T extends PixelDataLike = PixelDataLike> {
  private cellSize: number
  private cells: Map<string, T[]>
  private idToCellKey: Map<string, string> // [O(1) OPTIMIZATION] ID 기반 셀 키 매핑
  private idToLastAccess: Map<string, number> // [LRU MEMORY LIMIT] 픽셀의 최종 액세스 시간 추적
  private maxPixels: number // [LRU MEMORY LIMIT] 최대 보관 픽셀 수 제한

  constructor(cellSize: number = 2000, maxPixels: number = 3000) {
    this.cellSize = cellSize
    this.cells = new Map()
    this.idToCellKey = new Map()
    this.idToLastAccess = new Map()
    this.maxPixels = maxPixels
  }

  // [PERF v2] Pre-allocated 쿼리 버퍼 — 매 프레임 배열 생성 제거 (GC 방지)
  private _queryBuffer: T[] = []

  private getCellKey(x: number, y: number): string {
    const cx = Math.floor(x / this.cellSize)
    const cy = Math.floor(y / this.cellSize)
    return `${cx},${cy}`
  }

  /**
   * [O(1) OPTIMIZED UPSERT] 
   * 기존 데이터를 찾기 위해 전체 셀을 순회하지 않고, idToCellKey를 통해 즉각 제거합니다.
   */
  upsert(data: T): void {
    const newKey = this.getCellKey(data.coordX, data.coordY)
    
    // 이미 존재하는 픽셀 처리
    if (this.idToCellKey.has(data.pixelId)) {
      this.idToLastAccess.set(data.pixelId, Date.now()) // [LRU MEMORY LIMIT] 액세스 시간 최신화
      const oldKey = this.idToCellKey.get(data.pixelId)!
      
      // 같은 셀 내에서 업데이트
      if (oldKey === newKey) {
        const cell = this.cells.get(newKey)
        if (cell) {
          const idx = cell.findIndex(p => p.pixelId === data.pixelId)
          if (idx !== -1) {
            cell[idx] = data
            return
          }
        }
      } else {
        // 셀이 변경된 경우 (이동): 이전 셀에서 즉시 제거
        this._removeByIdAndKey(data.pixelId, oldKey)
      }
    } else {
      // [LRU MEMORY LIMIT] 신규 삽입 시 용량 제한 점검 및 방출 실행
      this.evictLRUIfNeeded()
    }

    // 새 셀에 추가 및 맵핑 업데이트
    this.idToCellKey.set(data.pixelId, newKey)
    this.idToLastAccess.set(data.pixelId, Date.now()) // [LRU MEMORY LIMIT] 액세스 시간 설정
    let cell = this.cells.get(newKey)
    if (!cell) {
      cell = []
      this.cells.set(newKey, cell)
    }
    cell.push(data)
  }

  /** [O(1) REMOVAL] 알려진 키를 이용해 단일 셀에서만 데이터를 제거합니다. */
  private _removeByIdAndKey(id: string, key: string): void {
    const cell = this.cells.get(key)
    if (cell) {
      const idx = cell.findIndex(p => p.pixelId === id)
      if (idx !== -1) {
        // [P-07 OPTIMIZATION] swap-and-pop: splice O(C) → O(1)
        cell[idx] = cell[cell.length - 1]
        cell.pop()
        if (cell.length === 0) {
          this.cells.delete(key)
        }
      }
    }
  }

  /** 단일 픽셀 제거 (캐시 싱크업 및 동적 소거용) */
  remove(id: string): void {
    const key = this.idToCellKey.get(id)
    if (key) {
      this._removeByIdAndKey(id, key)
      this.idToCellKey.delete(id)
      this.idToLastAccess.delete(id) // [LRU MEMORY LIMIT] 액세스 추적 데이터 소거
    }
  }

  /** 단일 진실 공급원(SSOT) 조회를 위한 getter 추가 */
  getPixel(pixelId: string): T | undefined {
    const key = this.idToCellKey.get(pixelId)
    if (key) {
      const cell = this.cells.get(key)
      if (cell) {
        const found = cell.find(p => p.pixelId === pixelId)
        if (found) {
          // [PERF v2] Date.now() 제거: 읽기 전용 조회에 쓰기 부작용 제거
          // LRU 방출은 upsert() 시점의 타임스탬프만으로 충분
          return found
        }
      }
    }
    return undefined
  }

  /** 하위 호환: 기존 insert 호출은 upsert로 위임 */
  insert(data: T): void {
    this.upsert(data)
  }

  insertMany(dataArray: T[]): void {
    for (const data of dataArray) {
      this.upsert(data)
    }
  }

  /** 전체 픽셀 반환 — -Infinity 쿼리 대체용 (무한 루프 방지) */
  getAll(): T[] {
    const result: T[] = []
    for (const cell of this.cells.values()) {
      result.push(...cell)
    }
    return result
  }

  /**
   * [PERF v2] 주어진 뷰포트 영역(Visual World 좌표계)과 교차하는 모든 격자의 PixelData를 반환합니다.
   * Pre-allocated 버퍼를 재사용하여 매 프레임 배열 생성 제거 (GC 방지).
   */
  query(minX: number, maxX: number, minY: number, maxY: number): T[] {
    // [CRITICAL FIX] -Infinity/Infinity → Math.floor 결과가 -Infinity가 되어 for 루프 무한 반복 방지
    if (!isFinite(minX) || !isFinite(maxX) || !isFinite(minY) || !isFinite(maxY)) {
      return this.getAll()
    }

    this._queryBuffer.length = 0  // 배열 참조 유지, GC 없음
    
    const startX = Math.floor(minX / this.cellSize)
    const endX = Math.floor(maxX / this.cellSize)
    const startY = Math.floor(minY / this.cellSize)
    const endY = Math.floor(maxY / this.cellSize)

    for (let cx = startX; cx <= endX; cx++) {
      for (let cy = startY; cy <= endY; cy++) {
        const key = `${cx},${cy}`
        const cell = this.cells.get(key)
        if (cell) {
          for (let i = 0; i < cell.length; i++) {
            this._queryBuffer.push(cell[i])
          }
        }
      }
    }

    return this._queryBuffer
  }

  /**
   * [MEMORY OPTIMIZATION] 지정된 뷰포트 범위를 완전히 벗어난(Out of Bounds) 셀(Chunk)을
   * 메모리에서 영구 삭제(Evict)하여 브라우저 RAM 누적을 방지합니다.
   */
  evictOutside(minX: number, maxX: number, minY: number, maxY: number): void {
    if (!isFinite(minX) || !isFinite(maxX) || !isFinite(minY) || !isFinite(maxY)) return

    const startX = Math.floor(minX / this.cellSize)
    const endX = Math.floor(maxX / this.cellSize)
    const startY = Math.floor(minY / this.cellSize)
    const endY = Math.floor(maxY / this.cellSize)

    // 모든 셀 키를 순회하며 바운딩 박스 밖에 있는 셀을 제거
    for (const key of Array.from(this.cells.keys())) {
      const [cxStr, cyStr] = key.split(',')
      const cx = parseInt(cxStr, 10)
      const cy = parseInt(cyStr, 10)

      if (cx < startX || cx > endX || cy < startY || cy > endY) {
        // 셀 내부의 픽셀들의 idToCellKey 매핑 제거
        const cell = this.cells.get(key)
        if (cell) {
          for (const p of cell) {
            this.idToCellKey.delete(p.pixelId)
          }
        }
        // 셀 자체를 메모리에서 날려버림
        this.cells.delete(key)
      }
    }
  }

  updatePosition(id: string, oldX: number, oldY: number, newX: number, newY: number): void {
    const data = this.getPixel(id)
    if (data) {
      data.coordX = newX
      data.coordY = newY
      this.upsert(data)
    }
  }

  /** [PERF v2] 용량 초과 시 Redis 방식 근사 LRU 방출: 전체 순회 O(N) → 랜덤 5건 샘플 O(1) */
  private evictLRUIfNeeded(): void {
    if (this.idToCellKey.size < this.maxPixels) return

    let oldestId: string | null = null
    let oldestTime = Infinity

    const keys = Array.from(this.idToLastAccess.keys())
    const sampleSize = Math.min(5, keys.length)
    for (let i = 0; i < sampleSize; i++) {
      const idx = Math.floor(Math.random() * keys.length)
      const id = keys[idx]
      const time = this.idToLastAccess.get(id)!
      if (time < oldestTime) {
        oldestTime = time
        oldestId = id
      }
    }

    if (oldestId) {
      this.remove(oldestId)
    }
  }

  clear(): void {
    this.cells.clear()
    this.idToCellKey.clear()
    this.idToLastAccess.clear() // [LRU MEMORY LIMIT] 캐시 완전 소거
  }

  exportState() {
    return {
      cells: new Map(this.cells),
      idToCellKey: new Map(this.idToCellKey),
      idToLastAccess: new Map(this.idToLastAccess)
    }
  }

  importState(state: { cells: Map<string, T[]>, idToCellKey: Map<string, string>, idToLastAccess: Map<string, number> }) {
    this.cells = state.cells
    this.idToCellKey = state.idToCellKey
    this.idToLastAccess = state.idToLastAccess
  }
}
