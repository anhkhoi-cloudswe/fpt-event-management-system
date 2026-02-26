//Note: Hình như không dùng trang này
import { PlusCircle, Ticket } from 'lucide-react'

type CategoryTicket = {
  id: string
  name: string
  price: number
  maxQuantity: number
  status: 'ACTIVE' | 'INACTIVE'
}

// TODO: Fetch category tickets from API
const categories: CategoryTicket[] = []

export default function CategoryTickets() {
  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Loại vé</h1>
          <p className="text-sm text-gray-500 mt-1">
            Quản lý các loại vé (Category Ticket) dùng cho sự kiện.
          </p>
        </div>
        <button
          type="button"
          className="inline-flex items-center px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
        >
          <PlusCircle className="w-4 h-4 mr-2" />
          Thêm loại vé (mock)
        </button>
      </div>

      {categories.length === 0 ? (
        <div className="bg-white rounded-lg shadow-md p-10 text-center">
          <Ticket className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 text-lg">Chưa có loại vé nào</p>
          <p className="text-sm text-gray-400 mt-2">
            Khi bạn tạo loại vé hoặc kết nối API, danh sách sẽ hiển thị tại đây.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Tên loại vé
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Giá
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Số lượng tối đa
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Trạng thái
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {categories.map(cat => (
                <tr key={cat.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {cat.name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-700">
                    {cat.price.toLocaleString('vi-VN')} đ
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-700">
                    {cat.maxQuantity}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        cat.status === 'ACTIVE'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {cat.status === 'ACTIVE' ? 'Đang mở bán' : 'Ngừng bán'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}


