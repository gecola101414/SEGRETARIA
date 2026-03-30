import React, { useState, useEffect } from 'react';
import { Calendar, dateFnsLocalizer, Event } from 'react-big-calendar';
import withDragAndDrop from 'react-big-calendar/lib/addons/dragAndDrop';
import 'react-big-calendar/lib/addons/dragAndDrop/styles.css';
import { format, parse, startOfWeek, getDay, parseISO } from 'date-fns';
import { it } from 'date-fns/locale';
import { db } from '../db/database';

const DnDCalendar = withDragAndDrop(Calendar);

const locales = {
  'it': it,
};

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
});

export default function AgendaCalendar({ onSelectAppointment }: { onSelectAppointment: (id: number) => void }) {
  const [events, setEvents] = useState<Event[]>([]);

  useEffect(() => {
    fetchAppointments();
  }, []);

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

  const handleSelectSlot = async ({ start }: any) => {
    const title = prompt("Titolo appuntamento:");
    if (title) {
      const date = format(start, 'yyyy-MM-dd');
      const time = format(start, 'HH:mm');
      await db.appointments.add({ title, date, time, description: '', createdAt: new Date() });
      fetchAppointments();
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
    <div className="h-[600px] p-4 bg-white rounded-lg shadow">
      <DnDCalendar
        localizer={localizer}
        events={events}
        startAccessor={(event: any) => event.start}
        endAccessor={(event: any) => event.end}
        onEventDrop={onEventDrop}
        onSelectSlot={handleSelectSlot}
        onSelectEvent={handleSelectEvent}
        selectable
        resizable
        defaultView="week"
        min={new Date(0, 0, 0, 7, 0, 0)}
        max={new Date(0, 0, 0, 20, 0, 0)}
        formats={formats}
        components={{ event: EventComponent }}
      />
    </div>
  );
}
