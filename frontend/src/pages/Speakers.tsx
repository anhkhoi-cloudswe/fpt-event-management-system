import { useState } from 'react'
import { PlusCircle, User, Search } from 'lucide-react'

type Speaker = {
  id: string
  name: string
  title: string
  bio: string
}

// TODO: Fetch speakers from API
const speakers: Speaker[] = []

export default function Speakers() {
  const [search, setSearch] = useState('')

  const filtered = speakers.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Diễn giả</h1>
          <p className="text-sm text-gray-500 mt-1">
            Quản lý danh sách diễn giả tham gia các sự kiện.
          </p>
        </div>
        <button
          type="button"
          className="inline-flex items-center px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
        >
          <PlusCircle className="w-4 h-4 mr-2" />
          Thêm diễn giả (mock)
        </button>
      </div>

      <div className="bg-white rounded-lg shadow-md p-4 mb-6 flex items-center">
        <Search className="w-4 h-4 text-gray-400 mr-2" />
        <input
          type="text"
          placeholder="Tìm theo tên diễn giả..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 border-none outline-none text-sm"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-lg shadow-md p-10 text-center">
          <User className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 text-lg">Chưa có diễn giả nào</p>
          <p className="text-sm text-gray-400 mt-2">
            Khi bạn thêm diễn giả hoặc kết nối API, danh sách sẽ hiển thị tại
            đây.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map(speaker => (
            <div
              key={speaker.id}
              className="bg-white rounded-lg shadow-md p-6 flex flex-col"
            >
              <div className="flex items-center mb-4">
                <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center mr-3">
                  <span className="text-lg font-semibold text-indigo-700">
                    {speaker.name.charAt(0)}
                  </span>
                </div>
                <div>
                  <p className="font-semibold text-gray-900">{speaker.name}</p>
                  <p className="text-xs text-gray-500">{speaker.title}</p>
                </div>
              </div>
              <p className="text-sm text-gray-600 line-clamp-3 flex-1">
                {speaker.bio}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}


