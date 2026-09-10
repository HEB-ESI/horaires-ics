import fs from 'fs';
import path from 'path';
import ics from 'ics';


/**
 * Geenerates ics files for profs, groupes, salles, cours from the events.json.
 * Input :  - icalroot, output directory for the ics files
 *          - events.json file path
 * Output : ics files + config file ("calendars.json")
 */

if (process.argv.length !== 5)
  throw new Error("Give path to ical root (where ics will go), path to events.json, and path to (to be generated) calendars.json, e.g. ./ical/ config/events.json")

const icalRoot = path.resolve(process.argv[2])
const eventsJsonFile = path.resolve(process.argv[3])
const calendarsJsonFile = path.resolve(process.argv[4])

const config = {
  default: 'groupes',
  root: path
    .relative(path.resolve('.'), icalRoot)
    .replace(/\/?$/, '/'), // ensure trailing slash
  data: {},
  transformers: JSON.parse(fs.readFileSync("colors.json"))
}

/* List of maps with:
  - key : profs/groupes/salles/cours
  - value: a list of events they attend.

  we build icss then generate ics files from its content.
*/


const icss = { profs: {}, groupes: {}, salles: {}, cours: {} }
const LIST_FORMATTER = new Intl.ListFormat('fr', { style: 'narrow', type: 'unit' })

// record the association "code => name" for later re-use
const names = { profs: {}, groupes: {}, salles: {}, cours: {} }

fs.readFile(eventsJsonFile, 'utf-8', (err, data) => {
  if (err) throw err

  //parse the json file
  const events = JSON.parse(data)

  /*
   for each event, we extract the teachers/groups/rooms/course
   and for each of them we add the event as an ics value. 
  */
  events.forEach(event => {
    ["profs", "groupes", "salles", "cours"].forEach((type) => {

      if (!event[type]) return // parfois il n'y a pas de groupe, par exemple (M1-cyber)
      for (let thing of event[type]) {
        if (names[type][thing.code] && names[type][thing.code] !== thing.name) {
          console.error("Existing names: ", names[type]);
          console.error("Overwriting with: ", thing.code, ": ", thing.name)
        }
        names[type][thing.code] = thing.name
      }
      addEvent(event[type], icss[type], getIcsEvent(event, type))
    })
  })

  console.log("generating all ics files: ")
  for (let type of ["profs", "groupes", "salles", "cours"]) {
    console.log(Object.keys(icss[type]).length + " " + type)
    generateIcss(icss[type], type)
  }


  fs.writeFile(calendarsJsonFile, JSON.stringify(config), (err) => {
    if (err) throw err;
  });
  console.log('calendar.json')

})

/**
 * Generates ics files based on the list.
 * The list contains keys and a list of events as value.
 * The key will be the file name
 * The values will be transformed in vcalendar.
 * @param {*} list 
 * @param {string} type
 */
function generateIcss(list, type) {
  const items = [] // items list in config.

  for (const key in list) {
    ics.createEvents(list[key], (error, value) => {
      if (error) {
        console.error(error)
        return
      }
      const filePath = `${icalRoot}/${type}/${key}.ics`
      fs.writeFile(filePath, value, (err) => {
        if (err) throw err;
        console.log(`${key}.ics`);
      });

      const item = (names[type][key] !== key) ? {
        code: key,
        name: names[type][key]
      } : {
        code: key
      }
      items.push(item)
    })
  }
  config.data[type] = { //add itemList (les profs, les cours...) to config
    name: { "profs": "enseignants" }[type] ?? type,
    items: items.sort((a, b) => (a.code.localeCompare(b.code)))
  }

}

/**
 * The listIn contains the elements (groupes/profs/salles)
 * that participate in an event.
 * The icsEvent will be added as value to the element (the key) in the map  
 * @param {*} listIn 
 * @param {*} map 
 * @param {*} icsEvent 
 */
function addEvent(listIn, map, icsEvent) {
  if (listIn) {
    listIn.forEach(element => {
      const code = element.code
      if (!map[code]) map[code] = []
      map[code].push(icsEvent);
    })
  }
}

/**
 * Returns an event object as expected by the ics library.
 * 
 * Relevant attributes: star, end, title, description, location, uid.
 * and maybe also: geo, url, status, organizer, attendees, categories,
 * recurrenceRule, lastModified, htmlContent (TODO check).
 * https://www.npmjs.com/package/ics
 * 
 * @param {*} event 
 * @param {*} type
 * @returns 
 */
function getIcsEvent(event, type) {
  const groupes = LIST_FORMATTER.format(event.groupes?.map(groupe => groupe.name))
  const profs = LIST_FORMATTER.format(event.profs?.map(prof => prof.code))
  const salles = LIST_FORMATTER.format(event.salles?.map(salle => salle.name) || "")
  const aa = LIST_FORMATTER.format(event.cours?.map(cours => cours.name))

  const title =
    {
      "salles": aa + " - " + profs + " - " + groupes + " - " + salles,
      "cours": aa + " - " + profs + " - " + groupes + " - " + salles,
      "profs": aa + " - " + groupes + " - " + salles,
      "groupes": aa + " - " + profs + " - " + salles
    }[type]



  return {
    start: getDateAsArray(new Date(event.start)),
    end: getDateAsArray(new Date(event.end)),
    title,
    description: event.description ?? "-",
    location: salles,
    uid: event.id
  }
}

/**
 * returns an array representing a datetime 
 * as expected by the ics library.
 * @param {*} date 
 * @returns 
 */
function getDateAsArray(date) {
  return [date.getFullYear(),
  date.getMonth() + 1,
  date.getDate(),
  date.getHours(),
  date.getMinutes()]
}
