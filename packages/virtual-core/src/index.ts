
import { memo } from './utils'

export * from './utils'

type ScrollAlignment = 'start' | 'center' | 'end' | 'auto'

export interface ScrollToOptions {
  align?: ScrollAlignment
  smoothScroll?: boolean
}

type ScrollToOffsetOptions = ScrollToOptions

type ScrollToIndexOptions = ScrollToOptions

export interface Range {
  startIndex: number
  endIndex: number
  overscan: number
  count: number
}

type Key = number | string

export interface VirtualItem {
  key: Key
  index: number
  start: number
  end: number
  size: number
}

interface Rect {
  width: number
  height: number
}

//

export const defaultKeyExtractor = (index: number) => index

export const defaultRangeExtractor = (range: Range) => {
  const start = Math.max(range.startIndex - range.overscan, 0)
  const end = Math.min(range.endIndex + range.overscan, range.count - 1)

  const arr = []

  for (let i = start; i <= end; i++) {
    arr.push(i)
  }

  return arr
}

const memoRectCallback = (
  instance: Virtualizer<any, any>,
  cb: (rect: Rect) => void,
) => {
  let prev: Rect = { height: -1, width: -1 }

  return (rect: Rect) => {
    if (
      instance.options.horizontal
        ? rect.width !== prev.width
        : rect.height !== prev.height
    ) {
      cb(rect)
    }

    prev = rect
  }
}

export const observeElementRect = (
  instance: Virtualizer<any, any>,
  cb: (rect: Rect) => void,
) => {
  const observer = new ResizeObserver((entries) => {
    cb({
      width: entries[0]?.contentRect.width as number,
      height: entries[0]?.contentRect.height as number,
    })
  })

  if (!instance.scrollElement) {
    return
  }

  cb(instance.scrollElement.getBoundingClientRect())

  observer.observe(instance.scrollElement)

  return () => {
    observer.unobserve(instance.scrollElement)
  }
}

export const observeWindowRect = (
  instance: Virtualizer<any, any>,
  cb: (rect: Rect) => void,
) => {
  const memoizedCallback = memoRectCallback(instance, cb)
  const onResize = () =>
    memoizedCallback({
      width: instance.scrollElement.innerWidth,
      height: instance.scrollElement.innerHeight,
    })

  if (!instance.scrollElement) {
    return
  }

  onResize()

  instance.scrollElement.addEventListener('resize', onResize, {
    capture: false,
    passive: true,
  })

  return () => {
    instance.scrollElement.removeEventListener('resize', onResize)
  }
}

type ObserverMode = 'element' | 'window'

const scrollProps = {
  element: ['scrollLeft', 'scrollTop'],
  window: ['scrollX', 'scrollY'],
} as const

const createOffsetObserver = (mode: ObserverMode) => {
  return (instance: Virtualizer<any, any>, cb: (offset: number) => void) => {
    if (!instance.scrollElement) {
      return
    }

    const propX = scrollProps[mode][0]
    const propY = scrollProps[mode][1]

    let prevX: number = instance.scrollElement[propX]
    let prevY: number = instance.scrollElement[propY]

    const scroll = () => {
      const offset =
        instance.scrollElement[instance.options.horizontal ? propX : propY]

      cb(Math.max(0, offset - instance.options.scrollMargin))
    }

    scroll()

    const onScroll = (e: Event) => {
      const target = e.currentTarget as HTMLElement & Window
      const scrollX = target[propX]
      const scrollY = target[propY]

      let shouldScroll;
      if (instance.options.horizontal) {
        shouldScroll = instance.options.reverse ? scrollX - prevX : prevX - scrollX;
      } else {
        shouldScroll = instance.options.reverse ? scrollY - prevY : prevY - scrollY;
      }

      if (shouldScroll) {
        scroll()
      }

      prevX = scrollX
      prevY = scrollY
    }

    instance.scrollElement.addEventListener('scroll', onScroll, {
      capture: false,
      passive: true,
    })

    return () => {
      instance.scrollElement.removeEventListener('scroll', onScroll)
    }
  }
}

export const observeElementOffset = createOffsetObserver('element')
export const observeWindowOffset = createOffsetObserver('window')

export const measureElement = <TItemElement extends Element>(
  element: TItemElement,
  instance: Virtualizer<any, TItemElement>,
) => {
  return Math.round(
    element.getBoundingClientRect()[
      instance.options.horizontal ? 'width' : 'height'
    ],
  )
}

export const windowScroll = (
  offset: number,
  { canSmooth, sync }: { canSmooth: boolean; sync: boolean },
  instance: Virtualizer<any, any>,
) => {
  const toOffset = sync ? offset : offset + instance.options.scrollMargin

  ;(instance.scrollElement as Window)?.scrollTo?.({
    [instance.options.horizontal ? 'left' : 'top']: toOffset,
    behavior: canSmooth ? 'smooth' : undefined,
  })
}

export const elementScroll = (
  offset: number,
  { canSmooth, sync }: { canSmooth: boolean; sync: boolean },
  instance: Virtualizer<any, any>,
) => {
  const toOffset = sync ? offset : offset + instance.options.scrollMargin

  ;(instance.scrollElement as Element)?.scrollTo?.({
    [instance.options.horizontal ? 'left' : 'top']: toOffset,
    behavior: canSmooth ? 'smooth' : undefined,
  })
}

export interface VirtualizerOptions<
  TScrollElement extends unknown,
  TItemElement extends Element,
> {
  // Required from the user
  count: number
  getScrollElement: () => TScrollElement | null
  estimateSize: (index: number) => number

  // Required from the framework adapter (but can be overridden)
  scrollToFn: (
    offset: number,
    options: { canSmooth: boolean; sync: boolean },
    instance: Virtualizer<TScrollElement, TItemElement>,
  ) => void
  observeElementRect: (
    instance: Virtualizer<TScrollElement, TItemElement>,
    cb: (rect: Rect) => void,
  ) => void | (() => void)
  observeElementOffset: (
    instance: Virtualizer<TScrollElement, TItemElement>,
    cb: (offset: number) => void,
  ) => void | (() => void)

  // Optional
  debug?: any
  initialRect?: Rect
  onChange?: (instance: Virtualizer<TScrollElement, TItemElement>) => void
  measureElement?: (
    el: TItemElement,
    instance: Virtualizer<TScrollElement, TItemElement>,
  ) => number
  overscan?: number
  horizontal?: boolean
  reverse?: boolean
  paddingStart?: number
  paddingEnd?: number
  scrollPaddingStart?: number
  scrollPaddingEnd?: number
  initialOffset?: number
  getItemKey?: (index: number) => Key
  rangeExtractor?: (range: Range) => number[]
  enableSmoothScroll?: boolean
  scrollMargin?: number
  scrollingDelay?: number
  indexAttribute?: string
}

export class Virtualizer<
  TScrollElement extends unknown,
  TItemElement extends Element,
> {
  private unsubs: (void | (() => void))[] = []
  options!: Required<VirtualizerOptions<TScrollElement, TItemElement>>
  scrollElement: TScrollElement | null = null
  isScrolling: boolean = false
  private isScrollingTimeoutId: ReturnType<typeof setTimeout> | null = null
  measurementsCache: VirtualItem[] = []
  private itemMeasurementsCache: Record<Key, number> = {}
  private pendingMeasuredCacheIndexes: number[] = []
  private scrollRect: Rect
  private scrollOffset: number
  private scrollDelta: number = 0
  private destinationOffset: undefined | number
  private scrollCheckFrame!: ReturnType<typeof setTimeout>
  private measureElementCache: Record<Key, TItemElement> = {}
  private getResizeObserver = (() => {
    let _ro: ResizeObserver | null = null

    return () => {
      if (_ro) {
        return _ro
      } else if (typeof ResizeObserver !== 'undefined') {
        return (_ro = new ResizeObserver((entries) => {
          entries.forEach((entry) => {
            this._measureElement(entry.target as TItemElement, false)
          })
        }))
      } else {
        return null
      }
    }
  })()
  range: { startIndex: number; endIndex: number } = {
    startIndex: 0,
    endIndex: 0,
  }

  constructor(opts: VirtualizerOptions<TScrollElement, TItemElement>) {
    this.setOptions(opts)
    this.scrollRect = this.options.initialRect
    this.scrollOffset = this.options.initialOffset

    this.calculateRange()
  }

  setOptions = (opts: VirtualizerOptions<TScrollElement, TItemElement>) => {
    Object.entries(opts).forEach(([key, value]) => {
      if (typeof value === 'undefined') delete (opts as any)[key]
    })

    this.options = {
      debug: false,
      initialOffset: 0,
      overscan: 1,
      paddingStart: 0,
      paddingEnd: 0,
      scrollPaddingStart: 0,
      scrollPaddingEnd: 0,
      horizontal: false,
      reverse: false,
      getItemKey: defaultKeyExtractor,
      rangeExtractor: defaultRangeExtractor,
      enableSmoothScroll: true,
      onChange: () => {},
      measureElement,
      initialRect: { width: 0, height: 0 },
      scrollMargin: 0,
      scrollingDelay: 150,
      indexAttribute: 'data-index',
      ...opts,
    }
  }

  private notify = () => {
    this.options.onChange?.(this)
  }

  private cleanup = () => {
    this.unsubs.filter(Boolean).forEach((d) => d!())
    this.unsubs = []
    this.scrollElement = null
  }

  _didMount = () => {
    return () => {
      this.getResizeObserver()?.disconnect()
      this.measureElementCache = {}

      this.cleanup()
    }
  }

  _willUpdate = () => {
    const scrollElement = this.options.getScrollElement()

    if (this.scrollElement !== scrollElement) {
      this.cleanup()

      this.scrollElement = scrollElement
      this._scrollToOffset(this.scrollOffset, {
        canSmooth: false,
        sync: true,
        requested: false,
      })

      this.unsubs.push(
        this.options.observeElementRect(this, (rect) => {
          this.scrollRect = rect
          this.calculateRange()
        }),
      )

      this.unsubs.push(
        this.options.observeElementOffset(this, (offset) => {
          if (this.isScrollingTimeoutId !== null) {
            clearTimeout(this.isScrollingTimeoutId)
            this.isScrollingTimeoutId = null
          }

          if (this.scrollOffset !== offset) {
            this.scrollOffset = offset
            this.isScrolling = true
            this.scrollDelta = 0

            this.isScrollingTimeoutId = setTimeout(() => {
              this.isScrollingTimeoutId = null
              this.isScrolling = false

              this.notify()
            }, this.options.scrollingDelay)
          } else {
            this.isScrolling = false
            this.scrollDelta = 0
          }

          this.calculateRange()
        }),
      )
    } else if (!this.isScrolling) {
      this.calculateRange()
    }
  }

  private getSize = () => {
    return this.scrollRect[this.options.horizontal ? 'width' : 'height']
  }

  private getMeasurements = memo(
    () => [
      this.options.count,
      this.options.paddingStart,
      this.options.reverse,
      this.options.getItemKey,
      this.itemMeasurementsCache,
    ],
    (count, paddingStart, reverse, getItemKey, measurementsCache) => {
      const min =
        this.pendingMeasuredCacheIndexes.length > 0
          ? Math.min(...this.pendingMeasuredCacheIndexes)
          : 0
      this.pendingMeasuredCacheIndexes = []

      const measurements = this.measurementsCache.slice(0, min)

      for (let i = min; i < count; i++) {
        const key = getItemKey(i)
        const measuredSize = measurementsCache[key]

        const size =
          typeof measuredSize === 'number'
            ? measuredSize
            : this.options.estimateSize(i)

        let start
        let end
        if (reverse) {
          end = measurements[i - 1]
            ? measurements[i - 1]!.start
            : paddingStart
          start = end - size
        } else {
          start = measurements[i - 1]
            ? measurements[i - 1]!.end
            : paddingStart
          end = start + size
        }

        measurements[i] = { index: i, start, size, end, key }
      }

      this.measurementsCache = measurements
      return measurements
    },
    {
      key: process.env.NODE_ENV !== 'production' && 'getMeasurements',
      debug: () => this.options.debug,
    },
  )

  calculateRange = memo(
    () => [this.getMeasurements(), this.getSize(), this.options.reverse, this.scrollOffset],
    (measurements, outerSize, reverse, scrollOffset) => {
      const range = calculateRange({
        measurements,
        outerSize,
        reverse,
        scrollOffset,
      })
      if (
        range.startIndex !== this.range.startIndex ||
        range.endIndex !== this.range.endIndex
      ) {
        this.range = range
        this.notify()
      }
      return this.range
    },
    {
      key: process.env.NODE_ENV !== 'production' && 'calculateRange',
      debug: () => this.options.debug,
    },
  )

  private getIndexes = memo(
    () => [
      this.options.rangeExtractor,
      this.range,
      this.options.overscan,
      this.options.count,
    ],
    (rangeExtractor, range, overscan, count) => {
      return rangeExtractor({
        ...range,
        overscan,
        count: count,
      })
    },
    {
      key: process.env.NODE_ENV !== 'production' && 'getIndexes',
      debug: () => this.options.debug,
    },
  )

  indexFromElement = (node: TItemElement) => {
    const attributeName = this.options.indexAttribute
    const indexStr = node.getAttribute(attributeName)

    if (!indexStr) {
      console.warn(
        `Missing attribute name '${attributeName}={index}' on measured element.`,
      )
      return -1
    }

    return parseInt(indexStr, 10)
  }

  private _measureElement = (node: TItemElement, _sync: boolean) => {
    const index = this.indexFromElement(node)

    const item = this.measurementsCache[index]
    if (!item) {
      return
    }

    const prevNode = this.measureElementCache[item.key]

    const ro = this.getResizeObserver()

    if (!node.isConnected) {
      if (prevNode) {
        ro?.unobserve(prevNode)
        delete this.measureElementCache[item.key]
      }
      return
    }

    if (!prevNode || prevNode !== node) {
      if (prevNode) {
        ro?.unobserve(prevNode)
      }
      this.measureElementCache[item.key] = node
      ro?.observe(node)
    }

    const measuredItemSize = this.options.measureElement(node, this)

    const itemSize = this.itemMeasurementsCache[item.key] ?? item.size

    let delta: number;

    if (this.options.reverse) {
      delta = -measuredItemSize;
    } else {
      delta = measuredItemSize - itemSize;
    }


    // if (measuredItemSize !== itemSize) {
    //   if (this.options.reverse) {
    //     if (item.end > this.scrollOffset) {
    //       if (process.env.NODE_ENV !== 'production' && this.options.debug) {
    //         console.info('correction', measuredItemSize)
    //       }

    //       if (!this.destinationOffset) {
    //         this._scrollToOffset(
    //           this.scrollOffset - measuredItemSize,
    //           false,
    //         )
    //       }
    //     }
    //   } else {
    //     if (item.start < this.scrollOffset) {
    //       if (process.env.NODE_ENV !== 'production' && this.options.debug) {
    //         console.info('correction', measuredItemSize - itemSize)
    //       }

    //       if (!this.destinationOffset) {
    //         this._scrollToOffset(
    //           this.scrollOffset + (measuredItemSize - itemSize),
    //           false,
    //         )
    //       }
    //     }
    //   }

    if (delta !== 0) {
      if (
        (this.options.reverse ? (item.end > this.scrollOffset) : (item.start < this.scrollOffset)) &&
        this.isScrolling &&
        this.destinationOffset === undefined
      ) {
        if (process.env.NODE_ENV !== 'production' && this.options.debug) {
          console.info('correction', delta)
        }
        this.scrollDelta += delta

        this._scrollToOffset(
          this.scrollOffset + this.scrollDelta,
          {
          canSmooth: false,
          sync: false,
          requested: false,
        })
      }

      this.pendingMeasuredCacheIndexes.push(index)
      this.itemMeasurementsCache = {
        ...this.itemMeasurementsCache,
        [item.key]: measuredItemSize,
      }
      this.notify()
    }
  }

  measureElement = (node: TItemElement | null) => {
    if (!node) {
      return
    }

    this._measureElement(node, true)
  }

  getVirtualItems = memo(
    () => [this.getIndexes(), this.getMeasurements()],
    (indexes, measurements) => {
      const virtualItems: VirtualItem[] = []

      for (let k = 0, len = indexes.length; k < len; k++) {
        const i = indexes[k]!
        const measurement = measurements[i]!

        virtualItems.push(measurement)
      }

      return virtualItems
    },
    {
      key: process.env.NODE_ENV !== 'production' && 'getIndexes',
      debug: () => this.options.debug,
    },
  )

  scrollToOffset = (
    toOffset: number,
    {
      align = 'start',
      smoothScroll = this.options.enableSmoothScroll,
    }: ScrollToOffsetOptions = {},
  ) => {
    const offset = this.scrollOffset
    const size = this.getSize()

    if (align === 'auto') {
      if (toOffset <= offset) {
        align = 'start'
      } else if (toOffset >= offset + size) {
        align = 'end'
      } else {
        align = 'start'
      }
    }

    const options = {
      canSmooth: smoothScroll,
      sync: false,
      requested: true,
    }
    if (align === 'start') {
        if (this.options.reverse) {
          this._scrollToOffset(toOffset + size, options)
        } else {
          this._scrollToOffset(toOffset, options)
        }
      } else if (align === 'end') {
        if (this.options.reverse) {
          this._scrollToOffset(toOffset, options)
        } else {
          this._scrollToOffset(toOffset - size, options)
        }
      } else if (align === 'center') {
        if (this.options.reverse) {
          this._scrollToOffset(toOffset + size / 2, options)
        } else {
          this._scrollToOffset(toOffset - size / 2, options)
        }
    }
  }

  scrollToIndex = (
    index: number,
    {
      align = 'auto',
      smoothScroll = this.options.enableSmoothScroll,
      ...rest
    }: ScrollToIndexOptions = {},
  ) => {
    const measurements = this.getMeasurements()
    const offset = this.scrollOffset
    const size = this.getSize()
    const { count } = this.options

    const measurement = measurements[Math.max(0, Math.min(index, count - 1))]

    if (!measurement) {
      return
    }

    if (this.options.reverse) {
      let o = offset * -1;
      let end = measurement.end * -1;
      let start = measurement.start * -1;

      if (align === 'auto') {
        if (start >= o + size - this.options.scrollPaddingEnd) {
          align = 'start'
        } else if (
          end <= o + this.options.scrollPaddingStart
        ) {
          align = 'end'
        } else {
          return
        }
      }

      const toOffset =
        align === 'end'
          ? measurement.end - this.options.scrollPaddingStart
          : measurement.start + this.options.scrollPaddingEnd
      this.scrollToOffset(toOffset, { align, smoothScroll, ...rest })
    } else {
      if (align === 'auto') {
        if (measurement.end >= offset + size - this.options.scrollPaddingEnd) {
          align = 'end'
        } else if (
          measurement.start <=
          offset + this.options.scrollPaddingStart
        ) {
          align = 'start'
        } else {
          return
        }
      }

      const toOffset =
        align === 'end'
          ? measurement.end + this.options.scrollPaddingEnd
          : measurement.start - this.options.scrollPaddingStart
      this.scrollToOffset(toOffset, { align, smoothScroll, ...rest })
    }
  }

  getTotalSize = () => {
    let size
    if (this.options.reverse) {
      size = (((this.getMeasurements()[this.options.count - 1]?.start ?? 0) * -1) ||
      this.options.paddingStart) + this.options.paddingEnd
    } else {
      size = (this.getMeasurements()[this.options.count - 1]?.end ||
      this.options.paddingStart) + this.options.paddingEnd
    }

    return size;
  }

  private _scrollToOffset = (
    offset: number,
    {
      requested,
      canSmooth,
      sync,
    }: { canSmooth: boolean; sync: boolean; requested: boolean },
  ) => {
    clearTimeout(this.scrollCheckFrame)

    if (requested) {
      this.destinationOffset = offset
    }
    this.options.scrollToFn(offset, { canSmooth, sync }, this)

    let scrollCheckFrame: ReturnType<typeof setTimeout>

    const check = () => {
      let lastOffset = this.scrollOffset
      this.scrollCheckFrame = scrollCheckFrame = setTimeout(() => {
        if (this.scrollCheckFrame !== scrollCheckFrame) {
          return
        }

        if (this.scrollOffset === lastOffset) {
          this.destinationOffset = undefined
          return
        }
        lastOffset = this.scrollOffset
        check()
      }, 100)
    }

    check()
  }

  measure = () => {
    this.itemMeasurementsCache = {}
    this.notify()
  }
}

const findNearestBinarySearch = (
  low: number,
  high: number,
  getCurrentValue: (i: number) => number,
  value: number,
) => {
  while (low <= high) {
    const middle = ((low + high) / 2) | 0
    const currentValue = getCurrentValue(middle)

    if (currentValue < value) {
      low = middle + 1
    } else if (currentValue > value) {
      high = middle - 1
    } else {
      return middle
    }
  }

  if (low > 0) {
    return low - 1
  } else {
    return 0
  }
}

function calculateRange({
  measurements,
  outerSize,
  reverse,
  scrollOffset,
}: {
  measurements: VirtualItem[]
  outerSize: number
  reverse: boolean,
  scrollOffset: number
}) {

  const count = measurements.length - 1
  let getOffset;

  let startIndex
  let endIndex
  if (reverse) {
    const getOffset = (index: number) => measurements[index]!.end * -1;
    startIndex =
      findNearestBinarySearch(0, count, getOffset, (scrollOffset * -1))
    endIndex = startIndex

    while (
      endIndex < count &&
      (measurements[endIndex]!.start * -1) < (scrollOffset * -1) + outerSize
    ) {
      endIndex++
    }
  } else {
    const getOffset = (index: number) => measurements[index]!.start
    startIndex =
      findNearestBinarySearch(0, count, getOffset, scrollOffset)
    endIndex = startIndex

    while (
      endIndex < count &&
      measurements[endIndex]!.end < scrollOffset + outerSize
    ) {
      endIndex++
    }
  }

  return { startIndex, endIndex }
}
