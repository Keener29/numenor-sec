import { useState } from "react";
import { Link } from "react-router";
import type { Route } from "./+types/dashboard";

export function meta({}: Route.MetaArgs) {
  // return metadata for the dashboard
  return [
    { title: "Dashboard - Numenor Security" },
    { name: "description", content: "Monitor your gym's email security" },
  ];
}

// Mock data for the dashboard
const mockEmails = [
  {
    id: 1,
    email: "info@goldengym.com",
    status: "Connected",
    alerts: 3,
    lastChecked: "2 hours ago",
  },
  {
    id: 2,
    email: "membership@goldengym.com",
    status: "Connected",
    alerts: 1,
    lastChecked: "1 hour ago",
  },
  {
    id: 3,
    email: "billing@goldengym.com",
    status: "Disconnected",
    alerts: 0,
    lastChecked: "3 days ago",
  },
  {
    id: 4,
    email: "support@goldengym.com",
    status: "Connected",
    alerts: 7,
    lastChecked: "30 minutes ago",
  },
  {
    id: 5,
    email: "admin@goldengym.com",
    status: "Connected",
    alerts: 2,
    lastChecked: "1 hour ago",
  },
];

// Mock data for the chart (last 7 days)
const chartData = [
  { day: "Mon", alerts: 2 },
  { day: "Tue", alerts: 4 },
  { day: "Wed", alerts: 1 },
  { day: "Thu", alerts: 6 },
  { day: "Fri", alerts: 3 },
  { day: "Sat", alerts: 2 },
  { day: "Sun", alerts: 1 },
];

export default function Dashboard() {
  const [emails, setEmails] = useState(mockEmails);

  const handleMarkSafe = (emailId: number) => {
    setEmails(emails.map(email => 
      email.id === emailId 
        ? { ...email, alerts: Math.max(0, email.alerts - 1) }
        : email
    ));
  };

  const getStatusColor = (status: string) => {
    return status === "Connected" 
      ? "bg-green-100 text-green-800" 
      : "bg-red-100 text-red-800";
  };

  const getAlertColor = (alerts: number) => {
    if (alerts === 0) return "text-gray-500";
    if (alerts <= 2) return "text-yellow-600";
    return "text-red-600";
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <Link to="/dashboard" className="flex-shrink-0">
                <h1 className="text-2xl font-bold text-gray-900">Numenor Security</h1>
              </Link>
            </div>
            <div className="flex items-center space-x-4">
              <Link
                to="/dashboard"
                className="text-gray-700 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium"
              >
                Dashboard
              </Link>
              <Link
                to="/login"
                className="text-gray-500 hover:text-gray-700 px-3 py-2 rounded-md text-sm font-medium"
              >
                Logout
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="px-4 py-6 sm:px-0">
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="mt-2 text-gray-600">
            Monitor your gym's email security and phishing protection status
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-blue-500 rounded-md flex items-center justify-center">
                    <span className="text-white text-sm font-medium">📧</span>
                  </div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      Monitored Emails
                    </dt>
                    <dd className="text-lg font-medium text-gray-900">
                      {emails.filter(e => e.status === "Connected").length}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-red-500 rounded-md flex items-center justify-center">
                    <span className="text-white text-sm font-medium">⚠️</span>
                  </div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      Total Alerts This Week
                    </dt>
                    <dd className="text-lg font-medium text-gray-900">
                      {emails.reduce((sum, email) => sum + email.alerts, 0)}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-green-500 rounded-md flex items-center justify-center">
                    <span className="text-white text-sm font-medium">✅</span>
                  </div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      Protection Status
                    </dt>
                    <dd className="text-lg font-medium text-gray-900">Active</dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Email Monitoring Table */}
          <div className="bg-white shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                Email Monitoring
              </h3>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Email Address
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Alerts
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {emails.map((email) => (
                      <tr key={email.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {email.email}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(email.status)}`}>
                            {email.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`text-sm font-medium ${getAlertColor(email.alerts)}`}>
                            {email.alerts}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          {email.alerts > 0 && (
                            <button
                              onClick={() => handleMarkSafe(email.id)}
                              className="bg-white text-blue-600 hover:text-blue-900 px-3 py-1 rounded border-0 hover:bg-blue-50"
                            >
                              Mark Safe
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Chart */}
          <div className="bg-white shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                Phishing Alerts (Last 7 Days)
              </h3>
              <div className="h-64 flex justify-between space-x-4 items-end">
                {chartData.map((data, index) => {
                  const maxAlerts = Math.max(...chartData.map(d => d.alerts));
                  const height = (data.alerts / maxAlerts) * 200;
                  
                  return (
                    <div key={index} className="flex flex-col items-center flex-1">
                      <div
                        className="bg-blue-500 w-full rounded-t mb-2"
                        style={{ height: `${height}px` }}
                      ></div>
                      <div className="text-xs text-gray-600">{data.day}</div>
                      <div className="text-xs font-medium text-gray-900">{data.alerts}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="mt-8 bg-white shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
              Recent Activity
            </h3>
            <div className="space-y-3">
              <div className="flex items-center text-sm">
                <div className="flex-shrink-0">
                  <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                </div>
                <div className="ml-3">
                  <span className="text-gray-900">Phishing attempt blocked for info@goldengym.com</span>
                  <span className="text-gray-500 ml-2">2 hours ago</span>
                </div>
              </div>
              <div className="flex items-center text-sm">
                <div className="flex-shrink-0">
                  <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                </div>
                <div className="ml-3">
                  <span className="text-gray-900">Suspicious email flagged for support@goldengym.com</span>
                  <span className="text-gray-500 ml-2">4 hours ago</span>
                </div>
              </div>
              <div className="flex items-center text-sm">
                <div className="flex-shrink-0">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                </div>
                <div className="ml-3">
                  <span className="text-gray-900">Email security scan completed</span>
                  <span className="text-gray-500 ml-2">6 hours ago</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
