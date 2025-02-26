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
  const { name, email, password } = req.body;

  try {
    const { data: registerData, error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      console.error("Error registering user:", error.message);
      return res.status(400).json({ error: error.message });
    }

    if (registerData) {
      const userId = registerData.user.id;
      const { error: dataError } = await supabase
        .from("user_data")
        .insert([
          { id: userId, streak_count: 0, login_days: [], user_name: name },
        ]);

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

app.post("/reset-password", async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: "Email jest wymagany" });
  }

  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: "moodie://reset-password",
    });

    if (error) {
      console.error("Błąd resetowania hasła:", error.message);
      return res.status(400).json({ error: error.message });
    }

    res.status(200).json({ message: "E-mail resetujący hasło został wysłany" });
  } catch (err) {
    console.error("Nieoczekiwany błąd:", err);
    res.status(500).json({ error: "Wewnętrzny błąd serwera" });
  }
});

app.post("/user/reset-password", async (req, res) => {
  const { newPassword, refreshToken } = req.body;

  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Couldn't find token" });
  }
  if (!refreshToken) {
    return res.status(401).json({ error: "Couldn't find refresh token" });
  }

  const accessToken = authHeader.split(" ")[1];

  try {
    const { data: sessionData, error: sessionError } =
      await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

    const { data, error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      return res.status(400).json({
        error: "We sent a message to your email - please check it.",
      });
    }

    res.status(200).json({ message: "Password updated successfully", data });
  } catch (err) {
    console.error("Unexpected error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/delete-account", async (req, res) => {
  const { userID } = req.body;

  if (!userID) {
    return res.status(400).json({ error: "User ID is required" });
  }

  try {
    const { error: authError } = await supabase.rpc("delete_user", {
      userid: userID,
    });

    if (authError) {
      throw authError;
    }
    await supabase.auth.signOut();

    return res.status(200).json({ message: "Account deleted successfully" });
  } catch (error) {
    console.error("Error deleting account:", error.message);
    return res
      .status(500)
      .json({ error: "An error occurred while deleting the account" });
  }
});

app.post("/saveUserInterview", async (req, res) => {
  const { emotionsIDs, quadrant, activities, userID } = req.body;
  try {
    const { data: interviewData, error } = await supabase
      .from("user_interview")
      .insert([
        {
          user_id: userID,
          emotion_ids: emotionsIDs,
          date: new Date(),
          quadrant: quadrant,
          sleeping_hours: activities.sleepingHours,
          exercise_hours: activities.exerciseHours,
          meals: activities.meals,
          activities: activities.activities,
        },
      ]);

    if (error) {
      console.error("Błąd podczas wstawiania danych:", error);
      return res
        .status(500)
        .json({ message: "Nie udało się zapisać danych", error });
    }

    res.status(200).json({ message: "Dane zostały zapisane pomyślnie" });
  } catch (err) {
    console.error("Nieoczekiwany błąd:", err);
    res.status(500).json({ message: "Wewnętrzny błąd serwera" });
  }
});

app.get("/emotions", async (req, res) => {
  const { x, y } = req.query;
  const newX = parseFloat((x - 8) / 8);
  const newY = parseFloat((y - 8) / 8);

  if (newX === undefined || newY === undefined) {
    return res.status(400).send({ error: "Brak współrzędnych x i y" });
  }

  try {
    const { data: emotions, error } = await supabase
      .from("emotions")
      .select("*")
      .gte("pleasantness", newX - 0.25)
      .lte("pleasantness", newX + 0.25)
      .gte("energy", newY - 0.25)
      .lte("energy", newY + 0.25);

    if (error) {
      throw error;
    }

    let quadrant = "";
    if (newX >= 0 && newY >= 0) quadrant = "high energy pleasant";
    else if (newX >= 0 && newY < 0) quadrant = "low energy pleasant";
    else if (newX < 0 && newY >= 0) quadrant = "high energy unpleasant";
    else quadrant = "low energy unpleasant";

    res.send({ emotions, quadrant });
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});

app.get("/emotionsByIds", async (req, res) => {
  const { IDs } = req.query;
  try {
    const { data: emotionsByIds, error } = await supabase
      .from("emotions")
      .select("*")
      .in("id", IDs);

    if (error) {
      throw error;
    }
    res.send({ emotionsByIds });
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});

app.get("/stats", async (req, res) => {
  const { userID } = req.query;
  try {
    const { data: stats, error: statsError } = await supabase
      .from("user_interview")
      .select("*")
      .eq("user_id", userID);

    if (statsError) {
      console.error("Błąd podczas pobierania statystyk:", statsError);
      return res
        .status(500)
        .json({ message: "Nie udało się pobierać statystyk", statsError });
    }

    const allEmotionIds = stats.flatMap((stat) => stat.emotion_ids);
    const emotionCounts = allEmotionIds.reduce((acc, id) => {
      acc[id] = (acc[id] || 0) + 1;
      return acc;
    }, {});

    const topEmotionIds = Object.entries(emotionCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id]) => parseInt(id));

    const { data: topEmotionsData, error: emotionsError } = await supabase
      .from("emotions")
      .select("id, emotion")
      .in("id", topEmotionIds);

    if (emotionsError) {
      console.error(
        "Błąd podczas pobierania najczęsciej zaznaczanych emocji:",
        emotionsError
      );
      return res.status(500).json({
        message: "Nie udało się pobrać najczęsciej zaznaczanych emocji",
        emotionsError,
      });
    }

    const emotionQuadrants = topEmotionsData.map((emotion) => {
      const associatedStat = stats.find((stat) =>
        stat.emotion_ids.includes(emotion.id)
      );
      const quadrant = associatedStat ? associatedStat.quadrant : null;
      return {
        ...emotion,
        quadrants: quadrant,
      };
    });

    res.send({ stats, emotionQuadrants });
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});

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
    const accessToken = data.session.access_token;
    const refreshToken = data.session.refresh_token;

    const { data: userData, error: userError } = await supabase
      .from("user_data")
      .select("user_name")
      .eq("id", userId)
      .single();

    if (userError) {
      console.error("Error while trying to fetch name in: ", userError.message);
      return res.status(400).json({ error: userError.message });
    }

    return res.status(200).json({
      message: "User logged in successfully",
      user: {
        userID: userId,
        email: data.user.email,
        name: userData.user_name,
        accessToken,
        refreshToken,
      },
    });
  } catch (err) {
    console.error("Unexpected error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/change-name", async (req, res) => {
  const { name, userId } = req.body;
  try {
    const { data: userData, error: userError } = await supabase
      .from("user_data")
      .update({ user_name: name })
      .eq("id", userId);

    if (userError) {
      console.error("Error while updating name:", userError.message);
      return res.status(400).json({ error: userError.message });
    }

    return res.status(200).json({
      message: "Name updated successfully",
    });
  } catch (err) {
    console.error("Unexpected error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/update-email", async (req, res) => {
  const { newEmail, refreshToken } = req.body;
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Couldn't find token" });
  }
  if (!refreshToken) {
    return res.status(401).json({ error: "Couldn't find refresh token" });
  }

  const accessToken = authHeader.split(" ")[1];
  try {
    const { data: sessionData, error: sessionError } =
      await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

    const { data, error } = await supabase.auth.updateUser({
      email: newEmail,
    });

    if (error) {
      return res.status(400).json({
        error: "We sent a message to your old email - please check it.",
      });
    }

    res.status(200).json({ message: "Email updated successfully", data });
  } catch (err) {
    console.error("Unexpected error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/enter-as-guest", async (req, res) => {
  try {
    const { data, error } = await supabase.auth.signInAnonymously();

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    const userId = data.user.id;
    const { error: dataError } = await supabase
      .from("user_data")
      .insert([
        { id: userId, streak_count: 0, login_days: [], user_name: "guest" },
      ]);

    if (dataError) {
      console.error("Error creating user data:", dataError);
    }

    return res.status(200).json({
      message: "User logged in successfully",
      user: {
        userID: userId,
        email: data.user.email,
        name: "guest",
      },
    });
  } catch (err) {
    console.error("Unexpected error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/getStreak", async (req, res) => {
  const { userID } = req.query;

  try {
    const { data: userData, error: userError } = await supabase
      .from("user_data")
      .select("streak_count, login_days, last_interviewed_at")
      .eq("id", userID)
      .single();

    if (userError) {
      console.error("Error fetching user data:", userError.message);
      return res.status(400).json({ error: "Could not retrieve user data." });
    }

    return res.status(200).json({
      message: "Data download successfull",
      streakData: {
        streak: userData.streak_count,
        loginDays: userData.login_days,
        interviewedAt: userData.last_interviewed_at,
      },
    });
  } catch (err) {
    console.error("Unexpected error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/updateStreak", async (req, res) => {
  const { userID } = req.body;
  try {
    const { data: userData, error: userError } = await supabase
      .from("user_data_extended")
      .select("*")
      .eq("id", userID)
      .single();

    if (userError) {
      console.error("Error fetching user data:", userError.message);
      return res.status(400).json({ error: "Could not retrieve user data." });
    }

    const now = new Date();
    const currentDayIndex = (now.getDay() + 6) % 7;

    const lastSignedAt = new Date(userData.last_sign_in_at);
    let lastInterviewedAt = new Date(userData.last_interviewed_at);
    let newStreakCount = userData.streak_count;
    let newLoginDays = [...(userData.login_days || [])];
    const createdAt = new Date(userData.created_at);

    const calculateDayDifference = (date1, date2) => {
      const startOfDate1 = new Date(
        date1.getFullYear(),
        date1.getMonth(),
        date1.getDate()
      );
      const startOfDate2 = new Date(
        date2.getFullYear(),
        date2.getMonth(),
        date2.getDate()
      );
      return Math.floor((startOfDate2 - startOfDate1) / (1000 * 60 * 60 * 24));
    };

    if (lastInterviewedAt == null) {
      newStreakCount = 1;
      newLoginDays = [currentDayIndex];
      lastInterviewedAt = now;
    } else {
      const dayDifference = calculateDayDifference(lastInterviewedAt, now);
      if (dayDifference > 1) {
        console.log("when more than one: ", dayDifference);
        newStreakCount = 1;
        newLoginDays = [currentDayIndex];
        lastInterviewedAt = now;
      } else if (dayDifference === 1) {
        console.log("when exactly one: ", dayDifference);
        if (!newLoginDays.includes(currentDayIndex)) {
          newStreakCount += 1;
          newLoginDays.push(currentDayIndex);
        }
        lastInterviewedAt = now;
      } else if (dayDifference < 0) {
        console.log("when whatever one: ", dayDifference);
        newStreakCount = 1;
        newLoginDays = [currentDayIndex];
        lastInterviewedAt = now;
      }
    }
    if (newLoginDays.length > 7) {
      newLoginDays = [currentDayIndex];
    }

    const { error: updateError } = await supabase
      .from("user_data")
      .update({
        streak_count: newStreakCount,
        login_days: newLoginDays,
        last_interviewed_at: lastInterviewedAt,
      })
      .eq("id", userID);

    if (updateError) {
      console.error("Error updating user streak:", updateError.message);
      return res.status(400).json({ error: "Could not update user streak." });
    }

    return res.status(200).json({
      message: "Data updated successfully",
      updatedData: {
        login_days: newLoginDays,
        lastInterviewed: lastInterviewedAt,
        streak: newStreakCount,
      },
    });
  } catch (err) {
    console.error("Unexpected error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/user/entry-days", async (req, res) => {
  const { userID } = req.query;

  const { data, error } = await supabase
    .from("user_interview_dates")
    .select("date")
    .eq("user_id", userID);

  if (error) {
    console.error("Error fetching interview dates:", error);
    return res.status(500).json({ error: "Failed to fetch dates" });
  }
  res.status(200).send(data);
});

app.get("/user/daily-history", async (req, res) => {
  const { userID, date } = req.query;

  const { data, error } = await supabase.rpc(
    "fetch_interviews_with_emotions_names",
    {
      userid: userID,
      interviewdate: date,
    }
  );

  if (error) {
    console.error("Error fetching daily history:", error);
    return res.status(500).json({ error: "Failed to fetch history" });
  }
  res.status(200).send(data);
});

app.post("/logout", async (req, res) => {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) {
      return res.status(400).json({ message: "Failed to log out" });
    }
    return res.status(200).json({ message: "Logged out successfully" });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Something went wrong during log out" });
  }
});

app.get("/journal-entry", async (req, res) => {
  const { userID } = req.query;
  const { data: entry, error } = await supabase
    .from("journal_entries")
    .select("*")
    .eq("user_id", userID)
    .eq("entry_date", new Date().toISOString().split("T")[0])
    .single();

  if (error && error.code !== "PGRST116") {
    return res.status(500).json({ error: error.message });
  }
  res.status(200).send(entry);
});

app.get("/journal-entry/date", async (req, res) => {
  const { userID, date } = req.query;
  const { data: entry, error } = await supabase
    .from("journal_entries")
    .select("*")
    .eq("user_id", userID)
    .eq("entry_date", date)
    .single();

  if (error && error.code !== "PGRST116") {
    return res.status(500).json({ error: error.message });
  }
  res.status(200).send(entry);
});

app.post("/journal-entry", async (req, res) => {
  const { userID, entry } = req.body;
  if (!userID || !entry)
    return res.status(400).json({ error: "userId and entry are required" });
  const { data, error } = await supabase.from("journal_entries").upsert(
    {
      user_id: userID,
      entry_date: new Date().toISOString().split("T")[0],
      entry,
    },
    { onConflict: ["user_id", "entry_date"] }
  );

  if (error) return res.status(500).json({ error: error.message });

  res.status(200).json({ message: "Wpis zapisany pomyślnie", data });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
