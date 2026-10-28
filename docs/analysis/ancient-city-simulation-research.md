# Research: interactive simulations of ancient cities

For *What the River Remembers* (/river). Two questions: **how** do researchers and designers
simulate ancient cities and rivers, and **which works** should the project cite or learn from?
Researched 2026-10-20.

---

## 1. Four ways to simulate an ancient city

### A. Agent-based models: people decide, the city emerges

Households or settlements are *agents* on a grid. Each follows a few rules (farm here, move if
the harvest fails), and population and settlement patterns emerge.

| Model | What it simulates | Why it matters here |
|---|---|---|
| **Sugarscape** (Epstein & Axtell, *Growing Artificial Societies*, 1996) | Agents with vision and metabolism on a landscape of one resource; migration, tribes, trade emerge. | The founding text of "grow a society from simple rules." Our project's premise in its purest form. |
| **Artificial Anasazi** (Axtell et al., *PNAS* 2002) | Ancestral Pueblo households in Long House Valley, Arizona, 800–1350 AD, farming under a reconstructed climate. | Reproduced the real rise, settlement shifts and decline. **Key finding: climate alone could not explain the final collapse.** A NetLogo version runs in the browser. |
| **MayaSim** (Heckbert, *JASSS* 2013) | Maya settlements linked by trade, with soil, forest, rain and water. | Built to test why the Maya rose and reorganized. |
| **ENKIMDU / MASS** (Oriental Institute, Chicago) | Bronze Age Mesopotamian households, farming and herding. | The household as the unit of an ancient city; irrigation-dependent. |

**Lesson from the critiques:** Janssen's 2009 replication found the Anasazi model's fit came
mostly from two carrying-capacity settings, not the agents' behavior. A 2025 revisit found
MayaSim settles into stable populations rather than collapsing. **Models like these show what
*could* happen, not what did.** Our site should say so: it's a "what if," grounded in research,
not a reconstruction.

### B. Landscape and river models: the land moves

- **CAESAR-Lisflood** (Coulthard et al., 2013): erosion, deposition and flooding over hours to
  thousands of years. Ramirez et al. (2020) used it with historical records to recreate how a
  1714 diversion of Switzerland's Kander River built a delta through repeated avulsions.
  Too heavy to run in a browser, but it is the reference for "a river that rebuilds its valley."
- **The avulsion rule** (the one to implement): a river **builds its bed up** in place until the
  bed stands too high above the floodplain beside it (**superelevation**), then **breaks out and
  takes the steepest way down**. Jerolmack & Paola (2007) showed that this single threshold, in a
  simple cellular model, produces the whole variety of real avulsions, small and large. The
  criterion goes back to Mohrig et al. (2000); a superelevation around 1 (bed level with the
  plain) is about the practical maximum.

  This is exactly the right scale for us: cheap, cellular, and true to the science.

### C. Procedural reconstruction: one moment, rebuilt in detail

- **Procedural Modeling of Cities** (Parish & Müller, SIGGRAPH 2001): streets grown by rules.
  Our street network descends from this.
- **Procedural Modeling of Buildings** (Müller et al., 2006): the CGA shape grammar, mass first,
  then façade, then details. Its showcase was **a virtual rebuilding of Pompeii**. It became
  CityEngine.
- **Rome Reborn** (Bernard Frischer): about 7,000 buildings of Rome in AD 320, flown over in VR.
  It shows one frozen year. **Our difference:** we show the city *changing* across centuries.

### D. History simulation in games: centuries in minutes

- **Dwarf Fortress**: generates a world, then simulates centuries of civilizations, wars and
  migrations before you play. **Legends mode** lets you read that history back. A model for our
  captions ("Year 640: the river broke its bank north of the city…").
- **Pharaoh** (1999; remake 2023): farming depends on the Nile's yearly flood.
  **Ancient Worlds: Egypt**: anything built on the floodplain is destroyed each flood, except
  roads and farms. Both make the river a rule the player has to live with.
- **Terra Nil** (2023): a "reverse city-builder." You restore a wasteland, then recycle every
  building and leave no trace. The closest game to our theme of building and erasing.

---

## 2. Interactive and museum references

| Work | What it is | What to take from it |
|---|---|---|
| **AR Sandbox** (Oliver Kreylos, UC Davis) | Real sand; a depth camera reads its shape; a projector draws contours and simulated water on it. Shown at Lake Tahoe's TERC and ECHO Lake Aquarium as "Shaping Watersheds." | Designed to **run in museums with little supervision.** Shape land with your hands; water follows. The software is free. A possible physical future for the project. |
| **Stream tables** (Emriver Em2/Em3) | Tables of plastic sediment with running water, used by nature centers and universities. | Real meanders, cutoffs and sediment, in minutes. Film one as reference footage for the river's look. |
| **Parable of the Polygons** (Vi Hart & Nicky Case, 2014) | A playable essay on Schelling's segregation model. | The **explorable explanation** structure: a guided story you play through, then a free sandbox at the end. Fits our flow: guided session first, free play after. |
| **Rome Reborn** | VR flight over AD 320 Rome. | Polished, authoritative reconstruction; the opposite of a rule-driven "what if." Useful contrast in the presentation. |

---

## 3. One more case for the sites

**Herakleion and Canopus** (Nile delta, Egypt) now lie 5–7 m under the sea. Stanley (2004)
argues they sank about 8 m over 2,500 years through flooding, earthquakes and the compaction of
soft delta mud. Said (2002) disputes the flood: the Canopic branch had already dried up. Flaux et
al. (2017) find subsidence finished the job but doesn't explain why the cities were abandoned.
A good example that **the causes are debated**, which the site can show honestly.

---

## 4. What this means for the simulation

A recipe that combines the four approaches at a size a browser can run:

1. **Grid:** 1 m cells; ground height, sediment depth, era of each soil layer.
2. **River (B):** each step the bed aggrades a little; floods spread sediment, more in low ground;
   when superelevation passes the threshold, the river **avulses** by steepest descent.
3. **City (A, simplified):** each district or settlement has a **carrying capacity** set by its
   water and farmland. Population grows toward it; when the water leaves, capacity falls,
   people leave, buildings decay. No individual agents needed: the critiques show capacity does
   most of the work anyway.
4. **Form (C):** streets and buildings are generated by rules, as now (plaza, streets, lots,
   buildings), with the founding rule shaping the layout.
5. **Memory (D):** every event is logged with a year; the log becomes the captions and the
   reveal at the end.

## 5. Reading order

1. Jerolmack & Paola 2007: the avulsion rule you'll implement.
2. Axtell et al. 2002, then Janssen 2009: what such models can and can't claim.
3. Parable of the Polygons: play it; it's the interaction model.
4. Kreylos's AR Sandbox page: the museum-device model.
5. Müller et al. 2006: the Pompeii procedural reconstruction, for the buildings.

## Sources

- [Axtell et al. 2002, Population growth and collapse in a multiagent model of the Kayenta Anasazi (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC128597)
- [Artificial Anasazi in NetLogo](https://ccl.northwestern.edu/netlogo/models/ArtificialAnasazi)
- [Janssen 2009, Understanding Artificial Anasazi (JASSS)](https://jasss.org/12/4/13.html)
- [Heckbert 2013, MayaSim (JASSS)](https://www.jasss.org/16/4/11.html)
- [MayaSim 2025 revisit (EGU25)](https://meetingorganizer.copernicus.org/EGU25/EGU25-21249.html)
- [Modeling Settlement Systems in a Dynamic Environment, Mesopotamia](https://acawiki.org/Modeling_Settlement_Systems_in_a_dynamic_Environment,_Case_Studies_from_Mesopotamia)
- [Agent-Based Holistic Simulations of Bronze Age Mesopotamian Settlement Systems (CAA)](https://proceedings.caaconference.org/?p=4606)
- [Epstein & Axtell, Growing Artificial Societies (Brookings)](https://www.brookings.edu/books/growing-artificial-societies)
- [CAESAR-Lisflood (CSDMS)](https://csdms.colorado.edu/wiki/Model:CAESAR_Lisflood)
- [Ramirez et al. 2020, early river engineering and CAESAR-Lisflood](https://boris.unibe.ch/146884/)
- [Coulthard et al. 2013, integrating LISFLOOD-FP with CAESAR](https://research-information.bris.ac.uk/en/publications/integrating-the-lisflood-fp-2d-hydrodynamic-model-with-the-caesar/)
- [Complexity in a cellular model of river avulsion (Jerolmack & Paola)](https://earth.sas.upenn.edu/content/complexity-cellular-model-river-avulsion)
- [Superelevation and avulsion (Frontiers in Earth Science, 2020)](https://www.frontiersin.org/journals/earth-science/articles/10.3389/feart.2020.00053/full)
- [Müller et al. 2006, Procedural Modeling of Buildings](https://history.siggraph.org/?p=113547)
- [CityEngine](https://en.wikipedia.org/wiki/CityEngine)
- [Rome Reborn (Smithsonian)](https://Www.Smithsonianmag.com/smart-news/vr-experience-restores-7000-roman-buildings-monuments-their-former-glory-180970901/)
- [Medieval Fantasy City Generator (watabou)](https://watabou.itch.io/medieval-fantasy-city-generator/devlog/153064/076-landmarks)
- [Dwarf Fortress world generation (wiki)](https://dwarffortresswiki.org/index.php/DF2014:World_gen)
- [Pharaoh: A New Era](https://en.wikipedia.org/wiki/Pharaoh:_A_New_Era)
- [Ancient Worlds: Egypt](https://www.vgdb.co/games/ancient-worlds-egypt)
- [Terra Nil (Science Friday)](https://www.sciencefriday.com/articles/terra-nil-video-game-climate-change/)
- [AR Sandbox (Kreylos, UC Davis)](https://www.cs.ucdavis.edu/~okreylos/ResDev/SARndbox/Pictures.html)
- [Shaping Watersheds facilitation guide](https://esu10.org/file_uploads/NIS/Shaping-Watersheds-AR-Sandbox-Facilitation-Guide.pdf)
- [VINS stream table](https://vinsweb.org/stream-table/)
- [Parable of the Polygons](https://en.wikipedia.org/wiki/Parable_of_the_Polygons)
- [Stanley 2004, Submergence of ancient Greek cities off Egypt's Nile Delta (GSA Today)](https://rock.geosociety.org/gsatoday/archive/14/1/pdf/gt0401.pdf)
- [Said 2002, Did Nile flooding sink two ancient cities? (Nature)](https://www.nature.com/articles/415037a)
- [Flaux et al. 2017, Canopus](https://ancientportsantiques.com/wp-content/uploads/Documents/PLACES/Egypt-Libya/NileDelta/Canope-Flaux2017.pdf)
