import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router";
import type { Route } from "./+types/dashboard";
import { emailsAPI, alertsAPI, authAPI, businessAPI } from "../utils/api";
import PhishingAlertChart from "../components/PhishingAlertChart";
import RecentActivity from "../components/RecentActivity";
import EmailMonitoring from "../components/EmailMonitoring";
import ConnectedEmailsDropdown from "../components/ConnectedEmailsDropdown";

export function meta({}: Route.MetaArgs) {
  // return metadata for the dashboard
  return [
    { title: "Dashboard - Numenor Security" },
    { name: "description", content: "Monitor your business email security" },
  ];
}

// Function to process daily alerts data for the chart
const processChartData = (dailyAlerts: any[]) => {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const today = new Date();
  
  // Create a map of date to count for quick lookup
  const alertsMap = new Map();
  dailyAlerts.forEach(alert => {
    // Convert ISO date to YYYY-MM-DD format for consistent lookup
    const dateString = new Date(alert.date).toISOString().split('T')[0];
    alertsMap.set(dateString, alert.count);
  });
    
  // Generate chart data for the last 7 days
  const chartData = [];
  for (let i = 6; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateString = date.toISOString().split('T')[0];
    const dayIndex = date.getDay();
    const dayName = days[dayIndex === 0 ? 6 : dayIndex - 1]; // Adjust for Monday start
    
    const alertCount = alertsMap.get(dateString) || 0;
    console.log(`Date: ${dateString}, Day: ${dayName}, Alerts: ${alertCount}`);
    
    chartData.push({
      day: dayName,
      alerts: alertCount
    });
  }
  
  return chartData;
};

export default function Dashboard() {
  const navigate = useNavigate();
  const [emails, setEmails] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [chartData, setChartData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setIsLoading(true);
      setError("");

      // Load emails, alerts, stats, and business info in parallel
      const [emailsResponse, alertsResponse, emailStats, alertStats, businessResponse] = await Promise.all([
        emailsAPI.getEmails({ limit: 10 }),
        alertsAPI.getAlerts({ limit: 10 }),
        emailsAPI.getEmailStats(),
        alertsAPI.getAlertStats(),
        businessAPI.getBusiness(),
      ]);

      console.log('Emails data:', emailsResponse.emails);
      console.log('Alerts data:', alertsResponse.alerts);
      
      setEmails(emailsResponse.emails || []);
      setAlerts(alertsResponse.alerts || []);
      setStats({
        ...emailStats.stats,
        ...alertStats.stats,
        businessName: businessResponse.business?.name || "Your Business",
      });

      // Process daily alerts data for the chart
      const dailyAlerts = alertStats.stats?.dailyAlerts || [];
      console.log('Daily alerts data:', dailyAlerts);
      const processedChartData = processChartData(dailyAlerts);
      console.log('Processed chart data:', processedChartData);
      setChartData(processedChartData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard data");
      console.error("Dashboard error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleMarkSafe = async (alertId: number) => {
    try {
      await alertsAPI.updateAlert(alertId, { status: "safe" });
      // Reload alerts to get updated data
      const alertsResponse = await alertsAPI.getAlerts({ limit: 10 });
      setAlerts(alertsResponse.alerts || []);
    } catch (err) {
      console.error("Failed to mark alert as safe:", err);
    }
  };

  const handleLogout = async () => {
    try {
      await authAPI.logout();
      navigate("/login");
    } catch (err) {
      console.error("Logout error:", err);
      // Still navigate to login even if logout API fails
      navigate("/login");
    }
  };


  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-8xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
                <h1 className="text-2xl font-bold text-gray-900">Numenor Security</h1>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={handleLogout}
                className="text-gray-700 px-3 py-2 rounded-md text-base font-medium bg-white border-0 cursor-pointer"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-8xl mx-auto py-6 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="px-4 py-6 sm:px-0">
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="mt-2 text-gray-600">
            Monitor your business's email security and phishing protection status
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mx-4 mb-4 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-md">
            {error}
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="mx-4 mb-8 flex justify-center">
            <div className="text-gray-500">Loading dashboard data...</div>
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <ConnectedEmailsDropdown 
            emails={emails} 
            onEmailsUpdate={loadDashboardData}
            businessName={stats.businessName || "Your Business"}
          />

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
                      {stats.totalAlerts || 0}
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
                    <dd className="text-lg font-medium text-gray-900">
                      {stats.connectedEmails > 0 ? "Active" : "Inactive"}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Email Monitoring */}
          <EmailMonitoring 
            emails={emails} 
            alerts={alerts} 
            onMarkSafe={handleMarkSafe} 
          />

          {/* Chart */}
          <PhishingAlertChart chartData={chartData} />
        </div>

        {/* Recent Activity */}
        <RecentActivity alerts={alerts} />
      </div>
    </div>
  );
}
