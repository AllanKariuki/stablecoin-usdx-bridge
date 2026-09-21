import React from 'react';
import { Search, Mail, Settings } from 'lucide-react';
import UserCircle from '../layouts/UserCircle';
import NotificationBell from '../notifications/NotificationBell';

const TopBar: React.FC = () => {
  return (
    <div className="bg-white border-b border-gray-200 px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 flex-1">
          <button className="p-2 hover:bg-gray-100 rounded-lg md:hidden">
            <span className="text-gray-600">☰</span>
          </button>
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Find something here..."
              className="w-full pl-10 pr-4 py-4 bg-gray-100 rounded-4xl text-sm focus:outline-none"
            />
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <button className="text-sm text-gray-600 hover:text-blue-600 hidden lg:block">Socials</button>
          <button className="text-sm text-gray-600 hover:text-blue-600 hidden lg:block">Live Training</button>
          <button className="text-sm text-gray-600 hover:text-blue-600 hidden lg:block">Blog</button>
          <button className="text-sm text-gray-600 hover:text-blue-600 hidden lg:block">Trading News</button>
          
          <div className="flex items-center gap-2 ml-4">
            <button className="relative p-2 hover:bg-gray-100 rounded-lg">
              {/* <Bell className="w-5 h-5 text-gray-600" /> */}
              <NotificationBell variant="light" />
              {/* <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span> */}
            </button>
            <button className="relative p-2 hover:bg-gray-100 rounded-lg">
              <Mail className="w-5 h-5 text-gray-600" />
              <span className="absolute top-1 right-1 w-2 h-2 bg-blue-500 rounded-full"></span>
            </button>
            <button className="relative p-2 hover:bg-gray-100 rounded-lg">
              <Settings className="w-5 h-5 text-gray-600" />
            </button>
            {/* <button className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center ml-2">
              <span className="text-white font-semibold">W</span>
            </button> */}

            <div className="flex items-center">
                <UserCircle />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TopBar;
