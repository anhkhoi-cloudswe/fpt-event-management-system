import { ChevronLeft, ChevronRight } from 'lucide-react'

interface PaginationProps {
  currentPage: number
  totalPages: number
  onPageChange: (page: number) => void
}

export default function Pagination({ currentPage, totalPages, onPageChange }: PaginationProps) {
  const getPageNumbers = () => {
    const pages: (number | string)[] = []
    const maxVisible = 5

    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i)
      }
      return pages
    }

    pages.push(1)

    if (currentPage > 3) {
      pages.push('...')
    }

    const start = Math.max(2, currentPage - 1)
    const end = Math.min(totalPages - 1, currentPage + 1)

    for (let i = start; i <= end; i++) {
      pages.push(i)
    }

    if (currentPage < totalPages - 2) {
      pages.push('...')
    }

    pages.push(totalPages)
    return pages
  }

  const pages = getPageNumbers()

  return (
    <nav className="flex items-center justify-center gap-2 mt-6" aria-label="Pagination">
      <button
        type="button"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        className="inline-flex min-w-10 items-center justify-center px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:bg-slate-100 disabled:text-slate-500 disabled:border-slate-200 dark:disabled:bg-slate-800 dark:disabled:text-slate-400 dark:disabled:border-slate-700 disabled:cursor-not-allowed transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
        <span className="ml-1 hidden sm:inline">Trước</span>
      </button>

      <div className="flex gap-1">
        {pages.map((page, index) =>
          page === '...' ? (
            <span key={`ellipsis-${index}`} className="px-3 py-2 text-slate-500 dark:text-slate-400">
              ...
            </span>
          ) : (
            <button
              type="button"
              key={page}
              onClick={() => onPageChange(page as number)}
              aria-current={currentPage === page ? 'page' : undefined}
              className={`min-w-10 px-3 py-2 rounded-lg border text-sm font-bold transition-colors ${
                currentPage === page
                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                  : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-100 border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              {page}
            </button>
          ),
        )}
      </div>

      <button
        type="button"
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        className="inline-flex min-w-10 items-center justify-center px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:bg-slate-100 disabled:text-slate-500 disabled:border-slate-200 dark:disabled:bg-slate-800 dark:disabled:text-slate-400 dark:disabled:border-slate-700 disabled:cursor-not-allowed transition-colors"
      >
        <span className="mr-1 hidden sm:inline">Sau</span>
        <ChevronRight className="w-4 h-4" />
      </button>
    </nav>
  )
}
