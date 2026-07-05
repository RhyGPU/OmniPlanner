import React, { useState, useEffect } from 'react';
import { Globe, Plus, Trash2, Sun, Moon } from 'lucide-react';

interface CityConfig {
  name: string;
  tz: string;
  flag?: string;
}

const AVAILABLE_CITIES: CityConfig[] = [
  { name: 'Seoul', tz: 'Asia/Seoul' },
  { name: 'Tokyo', tz: 'Asia/Tokyo' },
  { name: 'New York', tz: 'America/New_York' },
  { name: 'London', tz: 'Europe/London' },
  { name: 'Paris', tz: 'Europe/Paris' },
  { name: 'San Francisco', tz: 'America/Los_Angeles' },
  { name: 'Sydney', tz: 'Australia/Sydney' },
  { name: 'Singapore', tz: 'Asia/Singapore' },
  { name: 'Berlin', tz: 'Europe/Berlin' },
  { name: 'Dubai', tz: 'Asia/Dubai' },
  { name: 'Mumbai', tz: 'Asia/Kolkata' },
  { name: 'Hong Kong', tz: 'Asia/Hong_Kong' },
];

export const WorldClockTab: React.FC = () => {
  const [time, setTime] = useState(new Date());
  const [selectedCities, setSelectedCities] = useState<CityConfig[]>(() => {
    try {
      const saved = localStorage.getItem('omni_world_clock_cities');
      if (saved) return JSON.parse(saved);
    } catch (_) {}
    // Default cities
    return [
      { name: 'Seoul', tz: 'Asia/Seoul' },
      { name: 'Tokyo', tz: 'Asia/Tokyo' },
      { name: 'New York', tz: 'America/New_York' },
      { name: 'London', tz: 'Europe/London' },
      { name: 'San Francisco', tz: 'America/Los_Angeles' },
    ];
  });

  const [addCityName, setAddCityName] = useState('');

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    localStorage.setItem('omni_world_clock_cities', JSON.stringify(selectedCities));
  }, [selectedCities]);

  const handleAddCity = (name: string) => {
    if (!name) return;
    const city = AVAILABLE_CITIES.find(c => c.name === name);
    if (city && !selectedCities.some(c => c.name === city.name)) {
      setSelectedCities([...selectedCities, city]);
    }
    setAddCityName('');
  };

  const handleRemoveCity = (name: string) => {
    setSelectedCities(selectedCities.filter(c => c.name !== name));
  };

  // Helper to format time & check offset
  const getCityDetails = (city: CityConfig) => {
    try {
      // Get formatted time in target timezone
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: city.tz,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      });
      const parts = formatter.formatToParts(time);
      const hourStr = parts.find(p => p.type === 'hour')?.value || '12';
      const minStr = parts.find(p => p.type === 'minute')?.value || '00';
      const secStr = parts.find(p => p.type === 'second')?.value || '00';
      const ampmStr = parts.find(p => p.type === 'dayPeriod')?.value || 'AM';

      // Parse 24h format for Day/Night check
      const formatter24 = new Intl.DateTimeFormat('en-US', {
        timeZone: city.tz,
        hour: '2-digit',
        hour12: false,
      });
      const hour24 = parseInt(formatter24.format(time), 10);
      const isDay = hour24 >= 6 && hour24 < 18;

      // Calculate time offset relative to system timezone
      // We compare UTC offsets
      const utcTime = time.getTime();
      const localString = time.toLocaleString('en-US', { timeZone: city.tz });
      const systemString = time.toLocaleString('en-US');
      const localDate = new Date(localString);
      const systemDate = new Date(systemString);
      const offsetMinutes = Math.round((localDate.getTime() - systemDate.getTime()) / 60000);
      const offsetHours = Math.round(offsetMinutes / 60);

      let offsetLabel = 'Local';
      if (offsetHours > 0) {
        offsetLabel = `+${offsetHours} hrs`;
      } else if (offsetHours < 0) {
        offsetLabel = `${offsetHours} hrs`;
      }

      return {
        timeString: `${hourStr}:${minStr}:${secStr} ${ampmStr}`,
        isDay,
        offsetLabel,
        dateString: localDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', weekday: 'short' }),
      };
    } catch (e) {
      return {
        timeString: '--:--:--',
        isDay: true,
        offsetLabel: 'Error',
        dateString: '',
      };
    }
  };

  return (
    <div className="space-y-4">
      {/* Home Clock Header */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl p-6 text-white text-center shadow-xl relative overflow-hidden">
        <Globe size={90} className="absolute -right-4 -bottom-4 text-slate-700/20 pointer-events-none" />
        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Local Time (Home)</div>
        <div className="text-4xl font-black tracking-tight mt-1 animate-pulse font-mono">
          {time.toLocaleTimeString('en-US')}
        </div>
        <div className="text-xs font-bold text-slate-300 mt-1">
          {time.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </div>
      </div>

      {/* Selector and Grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">World Timezone Grid</h3>
          <div className="flex items-center gap-1.5">
            <select
              value={addCityName}
              onChange={(e) => handleAddCity(e.target.value)}
              className="bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 rounded-xl px-3 py-1.5 text-xs font-bold focus:outline-none focus:border-blue-500 transition-all cursor-pointer"
            >
              <option value="">+ Add City</option>
              {AVAILABLE_CITIES.map(c => {
                const alreadySelected = selectedCities.some(sc => sc.name === c.name);
                return (
                  <option key={c.name} value={c.name} disabled={alreadySelected}>
                    {c.name} ({c.tz.split('/')[0]})
                  </option>
                );
              })}
            </select>
          </div>
        </div>

        {/* Cities Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {selectedCities.map((city) => {
            const { timeString, isDay, offsetLabel, dateString } = getCityDetails(city);

            return (
              <div
                key={city.name}
                className={`relative rounded-3xl p-5 border transition-all shadow-sm overflow-hidden flex flex-col justify-between h-36 ${
                  isDay
                    ? 'bg-gradient-to-br from-sky-400 to-blue-500 text-white border-blue-300'
                    : 'bg-gradient-to-br from-slate-900 to-indigo-950 text-white border-slate-800'
                }`}
              >
                <div className="absolute top-4 right-4 pointer-events-none opacity-20">
                  {isDay ? <Sun size={50} /> : <Moon size={50} />}
                </div>

                <div className="flex items-start justify-between z-10">
                  <div>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-base font-black tracking-tight">{city.name}</span>
                      <span className={`text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded ${
                        isDay ? 'bg-white/20 text-white' : 'bg-slate-800 text-slate-300'
                      }`}>
                        {offsetLabel}
                      </span>
                    </div>
                    <div className={`text-[9px] font-bold mt-0.5 ${
                      isDay ? 'text-blue-50' : 'text-slate-400'
                    }`}>
                      {dateString}
                    </div>
                  </div>
                  
                  <button
                    onClick={() => handleRemoveCity(city.name)}
                    className={`p-1.5 rounded-full transition-colors ${
                      isDay ? 'hover:bg-white/20 text-white' : 'hover:bg-slate-800 text-slate-400 hover:text-red-400'
                    }`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                <div className="z-10 mt-2">
                  <div className="text-2xl font-black font-mono tracking-tight leading-none">
                    {timeString}
                  </div>
                  <div className={`text-[9px] font-black uppercase tracking-widest mt-1 ${
                    isDay ? 'text-blue-100' : 'text-slate-500'
                  }`}>
                    {isDay ? 'Daytime' : 'Nighttime'}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
