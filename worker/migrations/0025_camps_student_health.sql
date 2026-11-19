-- Optional health and food details a student may add on /hr/ (all can stay empty): food allergies, diet (halal, vegetarian ...), blood group, medical conditions.
ALTER TABLE camp_students ADD COLUMN food_allergy TEXT;
ALTER TABLE camp_students ADD COLUMN diet TEXT;
ALTER TABLE camp_students ADD COLUMN blood_type TEXT;
ALTER TABLE camp_students ADD COLUMN medical TEXT;
