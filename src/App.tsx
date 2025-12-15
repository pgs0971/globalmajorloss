import './index.css';
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { Search, Filter, ExternalLink, RefreshCw, AlertTriangle, Shield, CloudRain, Flame, Globe } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '[https://unpkg.com/leaflet@1.9.4/dist/leaflet.css](https://unpkg.com/leaflet@1.9.4/dist/leaflet.css)';
document.head.appendChild(link);

type Event = {
  id: number;
  canonical_title: string;
  peril: string;
  location_text: string | null;
  lat: number | null;
  lng: number | null;
  last_updated_at: string;
  articles: Article[];
};

type Article = {
  id: number;
  title: string;
  url: string;
  published_at: string;
  summary: string;
};

const PerilIcon = ({ type }: { type: string }) => {
  switch (type) {
    case 'Earthquake': return <Globe className="text-amber-600" size={20} />;
    case 'Storm': return <CloudRain className="text-blue-600" size={20} />;
    case 'Wildfire': return <Flame className="text-red-600" size={20} />;
    case 'Cyber': return <Shield className="text-purple-600" size={20} />;
    default: return <AlertTriangle className="text-gray-600" size={20} />;
  }
};

const App = () => {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'list' | 'map'>('list');
  const [search, setSearch] = useState('');
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/.netlify/functions/events?limit=100&search=${search}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setEvents(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [search]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      <div className="bg-slate-900 text-white p-4 sticky top-0 z-50 flex justify-between">
         <h1 className="font-bold flex gap-2"><Globe /> Global Major Loss Intelligence</h1>
         <button onClick={fetchData}><RefreshCw className={loading ? 'animate-spin' : ''}/></button>
      </div>

      <main className="max-w-7xl mx-auto p-4">
        <div className="mb-4 flex gap-4">
          <input className="border p-2 rounded flex-1" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} />
          <div className="flex bg-slate-200 rounded p-1">
            <button onClick={() => setView('list')} className={`px-4 py-1 rounded ${view === 'list' ? 'bg-white shadow' : ''}`}>List</button>
            <button onClick={() => setView('map')} className={`px-4 py-1 rounded ${view === 'map' ? 'bg-white shadow' : ''}`}>Map</button>
          </div>
        </div>

        {view === 'list' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {events.map(ev => (
              <div key={ev.id} onClick={() => setSelectedEvent(ev)} className="bg-white p-4 rounded border hover:shadow cursor-pointer">
                <div className="flex justify-between text-xs text-slate-500 mb-2">
                  <span className="bg-slate-100 px-2 py-0.5 rounded flex gap-1 items-center"><PerilIcon type={ev.peril}/> {ev.peril}</span>
                  <span>{formatDistanceToNow(new Date(ev.last_updated_at))} ago</span>
                </div>
                <h3 className="font-bold mb-1">{ev.canonical_title}</h3>
                <div className="text-xs text-slate-400">{ev.location_text}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="h-[600px] border rounded overflow-hidden">
            <MapContainer center={[20, 0]} zoom={2} style={{ height: '100%', width: '100%' }}>
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OpenStreetMap' />
              {events.filter(e => e.lat).map(ev => (
                <Marker key={ev.id} position={[ev.lat!, ev.lng!]} eventHandlers={{ click: () => setSelectedEvent(ev) }} />
              ))}
            </MapContainer>
          </div>
        )}
      </main>

      {selectedEvent && (
        <div className="fixed inset-0 bg-black/50 z-50 flex justify-end">
          <div className="bg-white w-full max-w-md p-6 overflow-y-auto">
            <button onClick={() => setSelectedEvent(null)} className="mb-4 text-sm text-slate-500">Close</button>
            <h2 className="text-xl font-bold mb-4">{selectedEvent.canonical_title}</h2>
            {selectedEvent.articles.map(a => (
              <div key={a.id} className="mb-4 border-l-2 pl-4">
                <h4 className="font-bold text-sm">{a.title}</h4>
                <p className="text-xs text-slate-500 mb-1">{new Date(a.published_at).toLocaleDateString()}</p>
                <p className="text-sm mb-1">{a.summary}</p>
                <a href={a.url} target="_blank" className="text-xs text-blue-600 flex items-center gap-1">Original Source <ExternalLink size={10}/></a>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);

