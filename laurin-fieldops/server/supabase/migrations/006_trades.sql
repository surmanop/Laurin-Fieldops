-- Trade list update (Nov 2026): adds Laurin, Excavation, Formwork, Firestopping, Specialty, Cleaning;
-- renames Exterior Cladding to Cladding everywhere it was used. Roofing, Flatworks and Glazing were already listed.
-- Specialty entries are saved as "Specialty: <name>" (the app asks which specialty).
update actuals set trade = 'Cladding' where trade = 'Exterior Cladding';
update commitments set trade = 'Cladding' where trade = 'Exterior Cladding';
update constraints set trade = 'Cladding' where trade = 'Exterior Cladding';
update wagons set trade = 'Cladding' where trade = 'Exterior Cladding';
update manpower set trade = 'Cladding' where trade = 'Exterior Cladding';
delete from trades;
insert into trades (name, sort_order) values ('Laurin', 1), ('Excavation', 2), ('Formwork', 3), ('Masonry', 4), ('Steel stud', 5), ('Firestopping', 6), ('Drywall', 7), ('Taping', 8), ('Paint', 9), ('Plumbing', 10), ('HVAC', 11), ('Electrical', 12), ('Controls', 13), ('Sprinkler', 14), ('Flooring', 15), ('Tile', 16), ('Millwork', 17), ('Glazing', 18), ('Cladding', 19), ('Flatworks', 20), ('Roofing', 21), ('Finish Carpentry', 22), ('Doors/Hardware', 23), ('Specialty', 24), ('Cleaning', 25);
