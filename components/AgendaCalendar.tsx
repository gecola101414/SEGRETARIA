import React, { useState, useEffect } from 'react';
import { Calendar, dateFnsLocalizer, Event } from 'react-big-calendar';
import withDragAndDrop from 'react-big-calendar/lib/addons/dragAndDrop';
import 'react-big-calendar/lib/addons/dragAndDrop/styles.css';
import { format, parse, startOfWeek, getDay, parseISO, isSaturday, isSunday } from 'date-fns';
import { it } from 'date-fns/locale';
import { db } from '../db/database';
import { CloudSun, Plus, Info } from 'lucide-react';

const DnDCalendar = withDragAndDrop(Calendar);

const locales = {
  'it': it,
};

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: (date: Date) => startOfWeek(date, { weekStartsOn: 1 }),
  getDay,
  locales,
});

// Helper for Italian holidays (simplified)
const isHoliday = (date: Date) => {
  const day = date.getDate();
  const month = date.getMonth() + 1;
  // Simple check for some fixed holidays
  const holidays = [
    { d: 1, m: 1 }, { d: 6, m: 1 }, { d: 25, m: 4 }, { d: 1, m: 5 },
    { d: 2, m: 6 }, { d: 15, m: 8 }, { d: 1, m: 11 }, { d: 8, m: 12 },
    { d: 25, m: 12 }, { d: 26, m: 12 }
  ];
  return holidays.some(h => h.d === day && h.m === month);
};

export default function AgendaCalendar({ onSelectAppointment }: { onSelectAppointment: (id: number) => void }) {
  const [events, setEvents] = useState<Event[]>([]);
  const [weather, setWeather] = useState<string>('Caricamento...');

  useEffect(() => {
    fetchAppointments();
    fetchWeather();
  }, []);

  const fetchWeather = async () => {
    const cachedWeather = localStorage.getItem('weather');
    if (cachedWeather) {
      setWeather(cachedWeather);
      return;
    }
    try {
      // Using a free weather API, e.g., Open-Meteo for Rome as example
      const res = await fetch('https://api.open-meteo.com/v1/forecast?latitude=41.9028&longitude=12.4964&current=temperature_2m,weather_code');
      const data = await res.json();
      const temp = data.current.temperature_2m;
      const desc = data.current.weather_code > 0 ? 'Nuvoloso' : 'Soleggiato';
      const weatherStr = `${temp}°C, ${desc}`;
      setWeather(weatherStr);
      localStorage.setItem('weather', weatherStr);
    } catch (e) {
      setWeather('N/A');
    }
  };

  const dayPropGetter = (date: Date) => {
    if (isSaturday(date) || isSunday(date) || isHoliday(date)) {
      return { className: 'bg-red-50' };
    }
    return {};
  };

  const fetchAppointments = async () => {
    const apps = await db.appointments.toArray();
    const formattedEvents = apps.map(app => {
      const start = parseISO(`${app.date}T${app.time}`);
      const end = new Date(start.getTime() + 60 * 60 * 1000); // 1 hour duration
      return {
        id: app.id,
        title: app.title,
        start,
        end,
        resource: app.description
      };
    });
    setEvents(formattedEvents);
  };

  const onEventDrop = async ({ event, start }: any) => {
    const appointment = await db.appointments.get(event.id);
    if (appointment) {
      const newDate = format(start, 'yyyy-MM-dd');
      const newTime = format(start, 'HH:mm');
      await db.appointments.update(event.id, { date: newDate, time: newTime });
      fetchAppointments();
    }
  };

  const [showAppointmentModal, setShowAppointmentModal] = useState(false);
  const [newAppointment, setNewAppointment] = useState({ title: '', location: '', start: new Date() });

  const handleSelectSlot = ({ start }: any) => {
    setNewAppointment({ title: '', location: '', start });
    setShowAppointmentModal(true);
  };

  const saveAppointment = async () => {
    if (newAppointment.title) {
      const date = format(newAppointment.start, 'yyyy-MM-dd');
      const time = format(newAppointment.start, 'HH:mm');
      await db.appointments.add({ 
        title: newAppointment.title, 
        date, 
        time, 
        description: '', 
        location: newAppointment.location, 
        createdAt: new Date() 
      });
      fetchAppointments();
      setShowAppointmentModal(false);
    }
  };

  const handleSelectEvent = (event: any) => {
    onSelectAppointment(event.id);
  };

  const formats = {
    timeGutterFormat: 'HH:mm',
    eventTimeRangeFormat: ({ start, end }: any, culture: any, localizer: any) =>
      `${localizer.format(start, 'HH:mm', culture)} - ${localizer.format(end, 'HH:mm', culture)}`,
  };

  const EventComponent = ({ event }: any) => (
    <div className="flex items-center gap-1 text-xs font-medium">
      <span>{event.title.toLowerCase().includes('riunione') ? '👥' : '📅'}</span>
      <span className="truncate">{event.title}</span>
    </div>
  );

  return (
    <div className="h-[600px] p-4 bg-white rounded-lg shadow flex flex-col">
      {showAppointmentModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-sm">
            <h2 className="text-lg font-bold mb-4">Nuovo Appuntamento</h2>
            <input 
              className="w-full p-2 border rounded mb-2"
              placeholder="Titolo"
              value={newAppointment.title}
              onChange={(e) => setNewAppointment({...newAppointment, title: e.target.value})}
            />
            <input 
              className="w-full p-2 border rounded mb-4"
              placeholder="Luogo (opzionale)"
              value={newAppointment.location}
              onChange={(e) => setNewAppointment({...newAppointment, location: e.target.value})}
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowAppointmentModal(false)} className="px-4 py-2 bg-gray-200 rounded">Annulla</button>
              <button onClick={saveAppointment} className="px-4 py-2 bg-green-500 text-white rounded">Salva</button>
            </div>
          </div>
        </div>
      )}
      <div className="flex justify-between items-center mb-2">
        <div className="flex items-center gap-2 text-sm font-bold">
          <CloudSun className="w-5 h-5 text-blue-500" />
          <span>{weather}</span>
        </div>
        <button 
          onClick={() => handleSelectSlot({ start: new Date() })}
          className="p-2 bg-green-500 text-white rounded-full"
          title="Nuovo appuntamento"
        >
          <Plus className="w-5 h-5" />
        </button>
      </div>
      <div className="flex-grow overflow-y-auto">
        <Calendar
          localizer={localizer}
          events={events}
          startAccessor={(event: any) => event.start}
          endAccessor={(event: any) => event.end}
          onSelectSlot={handleSelectSlot}
          onSelectEvent={handleSelectEvent}
          selectable
          defaultView="week"
          min={new Date(0, 0, 0, 7, 0, 0)}
          max={new Date(0, 0, 0, 20, 0, 0)}
          formats={formats}
          components={{ event: EventComponent }}
          dayPropGetter={dayPropGetter}
        />
      </div>
    </div>
  );
}
