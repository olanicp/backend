const express = require("express");
require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");
const bodyParser = require("body-parser");
const app = express();
const PORT = process.env.PORT || 5000;
app.use(bodyParser.json());

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

app.post("/register", async (req, res) => {
  const { email, password } = req.body;

  try {
    const { data, error } = await supabase.auth.signUp({ email, password });

    if (error) {
      console.error("Error registering user:", error.message);
      return res.status(400).json({ error: error.message });
    }

    if (data) {
      const { error: dataError } = await supabase
        .from("user_data")
        .insert([{ id: data.user.id, streak_count: 0 }]);

      if (dataError) {
        console.error("Error creating user data:", dataError);
      }
    }

    return res
      .status(200)
      .json({ message: "User registered successfully", data });
  } catch (err) {
    console.error("Unexpected error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.post('/saveUserInterview', async (req, res)=> {
  const {
    emotionsIDs,
    quadrant,
    activities,
    userID
  } = req.body
  console.log(emotionsIDs, activities.activities);
  try {
    const { data: interviewData, error } = await supabase
      .from('user_interview')
      .insert([
        {
          user_id: userID,
          emotion_ids: emotionsIDs,
          date: new Date(),
          quadrant: quadrant,
          sleepingHours: activities.sleepingHours,
          exerciseHours: activities.exerciseHours,
          meals: activities.meals,
          activities: activities.activities
        }
      ]);

    if (error) {
      console.error('Błąd podczas wstawiania danych:', error);
      return res.status(500).json({ message: 'Nie udało się zapisać danych', error });
    }

    res.status(200).json({ message: 'Dane zostały zapisane pomyślnie' });
  } catch (err) {
    console.error('Nieoczekiwany błąd:', err);
    res.status(500).json({ message: 'Wewnętrzny błąd serwera' });
  }
})

app.get('/emotions', async (req, res) => {
    const { x, y } = req.query;
    const newX = parseFloat((x - 8) / 8);
    const newY = parseFloat((y - 8) / 8);
  
    if (newX === undefined || newY === undefined) {
      return res.status(400).send({ error: 'Brak współrzędnych x i y' });
    }
  
    try {
      const { data: emotions, error } = await supabase
        .from('emotions')
        .select('*')
        .gte('pleasantness', newX - 0.25) 
        .lte('pleasantness', newX + 0.25) 
        .gte('energy', newY - 0.25) 
        .lte('energy', newY + 0.25); 
  
      if (error) {
        throw error;
      }
      console.log(emotions);
    
      let quadrant = '';
      if (newX >= 0 && newY >= 0) quadrant = 'high energy pleasant';
      else if (newX >= 0 && newY < 0) quadrant = 'low energy pleasant';
      else if (newX < 0 && newY >= 0) quadrant = 'high energy unpleasant';
      else quadrant = 'low energy unpleasant';
  
      res.send({ emotions, quadrant });
    } catch (err) {
      res.status(500).send({ error: err.message });
    }
});

app.get('/emotionsByIds', async (req, res) => {
  const {IDs} = req.query;
  try{
    const { data: emotionsByIds, error } = await supabase
      .from('emotions')
      .select('*')
      .in('id', IDs);

    if (error) {
      throw error;
    }
    console.log(emotionsByIds);
    res.send({ emotionsByIds});
  }catch (err) {
    res.status(500).send({ error: err.message });
  }
});

app.get("/stats", async (req, res) => {
  const { userID } = req.query;
  console.log(userID);
  try {
    const { data: stats, error } = await supabase
      .from('user_interview')
      .select('*')
      .eq("user_id", userID);

    if (error) {
      throw error;
    }
    console.log(stats);
  
    res.send({ stats });
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
})

app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.error("Error logging in:", error.message);
      return res.status(400).json({ error: error.message });
    }
    const userId = data.user.id;
    const { data: userData, error: userError } = await supabase
      .from("user_data")
      .select("streak_count, login_days")
      .eq("id", userId)
      .single();

    if (userError) {
      console.error("Error fetching user data:", userError.message);
      return res.status(400).json({ error: "Could not retrieve user data." });
    }

    const now = new Date();
    const currentDayIndex = (now.getDay() + 6) % 7;
    const lastSignedAt = new Date(data.user.last_sign_in_at);
    let newStreakCount = userData.streak_count;
    let newLoginDays = [...(userData.login_days || [])];
    const timeDifference = now.getTime() - lastSignedAt.getTime();
    const hoursDifference = timeDifference / (1000 * 60 * 60);
    const createdAt = new Date(data.user.created_at);
    if (createdAt.getDay() === now.getDay()) {
      //TODO: change for the date (lastsignedAt) from database
      newStreakCount = 1;
      newLoginDays = [currentDayIndex];
      console.log(createdAt.getDay(), lastSignedAt.getDay(), "what1");
    } else if (hoursDifference > 24) {
      newStreakCount = 1;
      newLoginDays = [currentDayIndex];
      console.log("what2");
    } else if (hoursDifference <= 24 && hoursDifference > 0) {
      newStreakCount += 1;
      if (!newLoginDays.includes(currentDayIndex)) {
        newLoginDays.push(currentDayIndex);
      }
      console.log("what3");
    } else {
      newStreakCount = 1;
      console.log("what4");
    }

    if (newLoginDays.length > 7) {
      newLoginDays = [currentDayIndex];
    }

    const { error: updateError } = await supabase
      .from("user_data")
      .update({
        streak_count: newStreakCount,
        login_days: newLoginDays,
      })
      .eq("id", userId);

    if (updateError) {
      console.error("Error updating user streak:", updateError.message);
      return res.status(400).json({ error: "Could not update user streak." });
    }

    return res.status(200).json({
      message: "User logged in successfully",
      user: {
        userID: userId,
        streak: newStreakCount,
        login_days: newLoginDays,
      },
    });
  } catch (err) {
    console.error("Unexpected error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.listen(PORT, () => {
  console.log("Server is running on port ${PORT}");
});
