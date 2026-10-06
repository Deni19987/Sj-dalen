-- Startdata för Sjödalen Bilar (samma innehåll som demoläget i src/data/seed.ts).
-- Kör efter migrationen. Tider sätts relativt "nu" så att auktionerna är aktiva.
-- Kan köras om: befintliga rader med samma id skrivs över.

begin;

insert into public.services (id, category, name, description, price_from, price_to, duration_min, popular, sort_order) values
  ('svc-ordinarie-service', 'Underhåll', 'Ordinarie service', 'Enligt tillverkarens serviceschema – vätskor, filter och allmän kontroll.', 1495, 2495, 60, true, 1),
  ('svc-stor-service', 'Underhåll', 'Stor service', 'Utökad genomgång inför långresa eller vid högre miltal.', 2995, 4495, 120, false, 2),
  ('svc-oljebyte', 'Underhåll', 'Oljebyte', 'Olja och oljefilter enligt tillverkarens specifikation.', 895, 1295, 30, false, 3),
  ('svc-bromsar', 'Reparation', 'Bromsbyte fram/bak', 'Bromsskivor och/eller bromsbelägg, ett eller två axlar.', 1990, 4990, 90, true, 4),
  ('svc-koppling', 'Reparation', 'Kopplingsbyte', 'Byte av kopplingssats inklusive lamell, urtrampningslager och tryckplatta.', 6900, 11900, 240, false, 5),
  ('svc-diagnos', 'Reparation', 'Felsökning & diagnos', 'Datorstyrd felsökning när en varningslampa lyser eller bilen låter konstigt.', 795, null, 45, false, 6),
  ('svc-forbesiktning', 'Besiktning', 'Förbesiktning', 'Vi går igenom bilen inför besiktningen och fixar det som brukar fälla.', 595, null, 45, true, 7),
  ('svc-efterkontroll', 'Besiktning', 'Efterkontroll', 'Åtgärdar anmärkningar från besiktningen och kör efterkontroll åt dig.', 395, null, 20, false, 8),
  ('svc-hjulskifte', 'Däck', 'Däckbyte (hjulskifte)', 'Byte mellan sommar- och vinterhjul, inklusive kontroll av mönsterdjup.', 495, null, 30, true, 9),
  ('svc-dackhotell', 'Däck', 'Däckhotell', 'Säsongsförvaring av dina hjul i vårt lager – vi ringer när det är dags att byta.', 995, null, 15, false, 10),
  ('svc-ac', 'Övrigt', 'AC-service', 'Kontroll, läcksökning och fyllning av köldmedium.', 995, 1495, 45, false, 11),
  ('svc-rekond', 'Övrigt', 'Fordonstvätt & invändig rekond', 'Utvändig tvätt, dammsugning och invändig rengöring.', 495, 1495, 60, false, 12)
on conflict (id) do update set category = excluded.category, name = excluded.name, description = excluded.description, price_from = excluded.price_from, price_to = excluded.price_to, duration_min = excluded.duration_min, popular = excluded.popular, sort_order = excluded.sort_order;

delete from public.bids where car_id in ('volvo-v70-2014', 'vw-golf-2017', 'toyota-corolla-2016', 'bmw-320d-2013', 'kia-sportage-2016', 'volvo-v40-2019', 'skoda-octavia-2018', 'audi-a3-2015');
delete from public.cars where id in ('volvo-v70-2014', 'vw-golf-2017', 'toyota-corolla-2016', 'bmw-320d-2013', 'kia-sportage-2016', 'volvo-v40-2019', 'skoda-octavia-2018', 'audi-a3-2015');

insert into public.cars (id, make, model, year, title, highlight, body_type, color_name, color_hex, mileage_km, fuel, gearbox, inspected, condition_summary, highlights, things_to_note, description, start_price, min_increment, ends_at, status, sold_price) values
  ('volvo-v70-2014', 'Volvo', 'V70', 2014, 'Volvo V70 D4 2014', 'Nyservad hos oss – redo att köras direkt.', 'kombi', 'Silvermetallic', '#B8BEC4', 182000, 'Diesel', 'Automat', true, 'Servad hos oss, i väntan på ny ägare.',
   array['Nyservad i vår verkstad', 'Nya bromsar fram', 'Kamrem bytt vid 150 000 km'],
   array['Mindre lackskada vänster framskärm'],
   'Pigg och välkörd familjekombi som gått igenom full service hos oss innan den läggs ut. Bra för den som vill ha mycket lastutrymme utan att betala nypris.', 45000, 1000, now() + interval '76 hours', 'active', null),
  ('vw-golf-2017', 'Volkswagen', 'Golf', 2017, 'Volkswagen Golf 1.4 TSI 2017', 'En ägare, fullständig servicebok och nya däck runt om.', 'halvkombi', 'Djupblå', '#2F5D8A', 98000, 'Bensin', 'Manuell', true, 'Ett av de fräschaste objekten just nu.',
   array['Enbart en ägare', 'Fullständig servicebok', 'Nya däck runt om'],
   array['Normalt slitage på förarsätet'],
   'Lättkörd och sparsam femdörrars i fint skick. Perfekt förstabil eller pendlarbil.', 68000, 1000, now() + interval '33 hours', 'active', null),
  ('toyota-corolla-2016', 'Toyota', 'Corolla', 2016, 'Toyota Corolla Touring Sports 2016', 'Kamkedja istället för kamrem – ett bekymmer mindre.', 'kombi', 'Pärlvit', '#F1F2F0', 121000, 'Bensin', 'Automat', true, 'Klassiskt pålitlig Toyota – låg driftskostnad.',
   array['Kamkedja (inget kamremsbyte behövs)', 'Nybesiktigad utan anmärkning'],
   array['Några mindre parkeringsmärken på stötfångarna'],
   'Trygg och stryktålig kombi känd för att gå långt utan strul.', 72000, 1000, now() + interval '120 hours', 'active', null),
  ('bmw-320d-2013', 'BMW', '320d', 2013, 'BMW 320d Sedan 2013', 'Rejält nedprisad på grund av miltalet – körstark och gedigen ändå.', 'sedan', 'Svart', '#1C1E22', 245000, 'Diesel', 'Automat', true, 'Hög miltal – prissatt därefter. Fin köreknomi.',
   array['Nya däck vinter och sommar ingår', 'Stark och pigg trots miltalet'],
   array['Servicebehov inom kort – vi berättar exakt vad vid visning', 'Mindre stenskott i vindrutan'],
   'Rejält nedprisad på grund av miltalet, men körstark och gedigen. Bra objekt för den händiga.', 34000, 500, now() + interval '6 hours', 'active', null),
  ('kia-sportage-2016', 'Kia', 'Sportage', 2016, 'Kia Sportage 1.7 CRDi 2016', 'Rymlig familje-SUV i bra skick, redo för vintern.', 'suv', 'Grafitgrå', '#4A4E55', 134000, 'Diesel', 'Automat', true, 'Rymlig SUV i bra skick, redo för vintern.',
   array['Dragkrok', 'Nyligen bytta bromsar runt om', 'Kias garanti gäller delvis kvar'],
   array['Normalt slitage i lastutrymmet'],
   'Populär familje-SUV med gott om plats och fyrhjulsdrift på de flesta modeller i den här generationen.', 79000, 1000, now() + interval '62 hours', 'active', null),
  ('volvo-v40-2019', 'Volvo', 'V40', 2019, 'Volvo V40 T3 2019 – Veckans bil', 'Det finaste vi haft in på länge – lågmilare med skinnklädsel.', 'halvkombi', 'Kritvit', '#F3F4F2', 61000, 'Bensin', 'Manuell', true, 'Nyaste och finaste objektet i auktionen just nu.',
   array['Lågmilare', 'Skinnklädsel', 'Backkamera', 'Aldrig krockskadad'],
   array['Vinterdäcken är från föregående ägare, inte original'],
   'Det finaste vi haft in på länge. Servad och genomgången i vår verkstad – redo att bara hämtas och köras.', 112000, 2000, now() + interval '98 hours', 'active', null),
  ('skoda-octavia-2018', 'Skoda', 'Octavia', 2018, 'Skoda Octavia Combi 2018', 'Rymlig och pigg kombi – gick till ny ägare efter fem bud.', 'kombi', 'Röd', '#B33025', 76000, 'Bensin', 'Manuell', true, 'Solt objekt, gick till ny ägare efter fem bud.',
   array['En ägare', 'Fullservad hos oss', 'Nya bromsar och däck'],
   array['Mindre buckla på bakre stötfångaren'],
   'Rymlig och pigg kombi som gick snabbt – ny ägare hämtade den redan dagen efter auktionsslut.', 89000, 1000, now() - interval '216 hours', 'sold', 96000),
  ('audi-a3-2015', 'Audi', 'A3', 2015, 'Audi A3 Sportback 2015', 'Kompakt premiumbil som gick till högsta budet på tre veckor.', 'halvkombi', 'Månsten grå', '#9AA0A6', 143000, 'Diesel', 'Manuell', true, 'Gick till budgivaren med högst slutbud för tre veckor sedan.',
   array['Nyservad', 'Nya kamremssats vid 120 000 km'],
   array['Lackskada på höger backspegel'],
   'Kompakt premiumbil som lämnade verkstaden i fint skick – redan i sitt nya hem.', 58000, 1000, now() - interval '552 hours', 'sold', 61000);

insert into public.bids (car_id, name, amount, created_at) values
  ('volvo-v70-2014', 'Anders K.', 47000, now() - interval '48 hours'),
  ('volvo-v70-2014', 'Malin S.', 49500, now() - interval '27 hours'),
  ('volvo-v70-2014', 'Johan L.', 52000, now() - interval '5 hours'),
  ('vw-golf-2017', 'Frida N.', 69500, now() - interval '20 hours'),
  ('vw-golf-2017', 'Peter H.', 71000, now() - interval '6 hours'),
  ('toyota-corolla-2016', 'Camilla B.', 73500, now() - interval '24 hours'),
  ('bmw-320d-2013', 'Oskar T.', 35000, now() - interval '72 hours'),
  ('bmw-320d-2013', 'Elin R.', 36500, now() - interval '32 hours'),
  ('bmw-320d-2013', 'Niklas E.', 38000, now() - interval '2 hours'),
  ('volvo-v40-2019', 'Sara V.', 114000, now() - interval '48 hours'),
  ('volvo-v40-2019', 'Mikael J.', 118000, now() - interval '10 hours'),
  ('skoda-octavia-2018', 'Fredrik A.', 91000, now() - interval '288 hours'),
  ('skoda-octavia-2018', 'Linda P.', 93500, now() - interval '264 hours'),
  ('skoda-octavia-2018', 'Robert G.', 96000, now() - interval '219 hours'),
  ('audi-a3-2015', 'Jonas W.', 59000, now() - interval '600 hours'),
  ('audi-a3-2015', 'Åsa M.', 61000, now() - interval '557 hours');

delete from public.reviews where id in ('r1', 'r2', 'r3', 'r4', 'r5');
insert into public.reviews (id, name, rating, text, sort_order, created_at) values
  ('r1', 'Petra Lindqvist', 5, 'Fick min Volvo servad på en dag och de förklarade precis vad som gjorts. Köpte sedan en bil till min son via auktionen – smidigt från start till mål.', 1, now() - interval '336 hours'),
  ('r2', 'Mattias Ohlsson', 5, 'Ärliga och raka i sin kommunikation. Blev uppringd innan de gjorde något som kostade extra.', 2, now() - interval '720 hours'),
  ('r3', 'Yasmin Al-Rawi', 5, 'Vann en bil på auktionen som redan var genomgången av verkstaden – kändes tryggare än att köpa privat.', 3, now() - interval '144 hours'),
  ('r4', 'Henrik Sundqvist', 4, 'Bra service, fick vänta någon dag extra på en reservdel men blev väl informerad hela vägen.', 4, now() - interval '1080 hours'),
  ('r5', 'Carina Berg', 5, 'Har haft däckhotell hos dem i två år. Enkelt att boka och bilen är alltid ren när jag hämtar den.', 5, now() - interval '1440 hours');

insert into public.faqs (id, question, answer, sort_order) values
  ('f1', 'Behöver jag boka tid för service?', 'Ja, vi jobbar bokat för att kunna ge varje bil ordentligt med tid. Boka enklast direkt på sidan Boka tid, så bekräftar vi inom en arbetsdag.', 1),
  ('f2', 'Vad betyder "verkstadsbesiktigad" på auktionsbilarna?', 'Det betyder att bilen är genomgången av våra egna mekaniker innan den läggs ut – inte bara en snabb okulär koll som i en vanlig annons. Du ser alltid vad som är kontrollerat och åtgärdat på bilens egen sida.', 2),
  ('f3', 'Hur fungerar budgivningen?', 'Varje bil har ett startpris och en nedräkning. Du lägger ett bud som är minst så högt som det angivna minsta nästa bud. Högsta bud när tiden går ut vinner. Vi kontaktar dig för betalning och avhämtning.', 3),
  ('f4', 'Kan jag sälja min bil till er utan att den läggs ut på auktion?', 'Ja. Fyll i formuläret under "Sälj din bil till oss" så återkommer vi med ett bud, oavsett om bilen sedan säljs vidare via auktionen eller inte.', 4),
  ('f5', 'Erbjuder ni lånebil?', 'Vi har ett begränsat antal lånebilar för större jobb som tar mer än en dag. Fråga när du bokar, så ordnar vi det om vi har möjlighet.', 5),
  ('f6', 'Vad händer om jag vinner en auktion?', 'Vi hör av oss samma eller nästa vardag med betalningsuppgifter. Bilen hämtas hos oss i Sjödalen, och vi hjälper till med ägarbyte på plats.', 6),
  ('f7', 'Var ligger verkstaden?', 'Vi finns i Sjödalen. Fullständig adress och öppettider hittar du under Kontakt.', 7)
on conflict (id) do update set question = excluded.question, answer = excluded.answer, sort_order = excluded.sort_order;

commit;
