interface ChartData {
  uuid: string;
  day: string;
  alerts: number;
}

interface PhishingAlertChartProps {
  chartData: ChartData[];
}

export default function PhishingAlertChart({ chartData }: PhishingAlertChartProps) {
  return (
    <div className="bg-white shadow rounded-lg">
      <div className="px-4 py-5 sm:p-6">
        <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
          Phishing Alerts (Last 7 Days)
        </h3>
        <div className="h-64 flex justify-between space-x-4 items-end">
          {chartData.length > 0 ? chartData.map((data) => {
            const maxAlerts = Math.max(...chartData.map(d => d.alerts), 1);
            const height = (data.alerts / maxAlerts) * 200;
            
            return (
              <div key={data.uuid} className="flex flex-col items-center flex-1">
                <div
                  className="bg-blue-500 w-full rounded-t mb-2"
                  style={{ height: `${height}px` }}
                ></div>
                <div className="text-xs text-gray-600">{data.day}</div>
                <div className="text-xs font-medium text-gray-900">{data.alerts}</div>
              </div>
            );
          }) : (
            <div className="flex items-center justify-center w-full h-full text-gray-500">
              No alert data available
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
