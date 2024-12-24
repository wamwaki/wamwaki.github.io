#include <NewPing.h>
#include <ESP32Servo.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// WiFi Configuration
const char *ssid = "YourWiFiName";
const char *password = "YourWiFiPassword";
const char *serverUrl = "http://192.168.0.103:3000/api/arduino/update";

// Your existing pin definitions
#define MAX_DISTANCE 200

#define TRIG_PIN1 12 // Slot 1
#define ECHO_PIN1 14
#define TRIG_PIN2 5 // Slot 2
#define ECHO_PIN2 16
#define TRIG_PIN3 17 // Slot 3
#define ECHO_PIN3 15

#define TRIG_PIN_ENTRY 23 // Entry sensor
#define ECHO_PIN_ENTRY 22

#define TRIG_PIN_EXIT 19 // Exit sensor
#define ECHO_PIN_EXIT 18

#define LED_PIN 2

#define LDR_PIN1 32
#define LDR_PIN2 25
#define LDR_PIN3 27
#define LDR_PIN_MID1 33
#define LDR_PIN_MID2 26

#define BUZZER_PIN 13

// Create NewPing objects for each ultrasonic sensor
NewPing sonar1(TRIG_PIN1, ECHO_PIN1, MAX_DISTANCE);
NewPing sonar2(TRIG_PIN2, ECHO_PIN2, MAX_DISTANCE);
NewPing sonar3(TRIG_PIN3, ECHO_PIN3, MAX_DISTANCE);
NewPing sonarEntry(TRIG_PIN_ENTRY, ECHO_PIN_ENTRY, MAX_DISTANCE);
NewPing sonarExit(TRIG_PIN_EXIT, ECHO_PIN_EXIT, MAX_DISTANCE);

Servo myservo;

// Variables
int distanceSlot1, distanceSlot2, distanceSlot3, distanceEntry, distanceExit;
int slots = 3;
int flag1 = 0;
int flag2 = 0;
int LDR_1Value, LDR_2Value, LDR_3Value, LDR_MID1Value, LDR_MID2Value;

// Function to send data to web server
void sendDataToServer()
{
    if (WiFi.status() == WL_CONNECTED)
    {
        HTTPClient http;
        http.begin(serverUrl);
        http.addHeader("Content-Type", "application/json");

        // Create JSON document
        StaticJsonDocument<400> doc;

        // Slot status
        doc["slot1"] = (distanceSlot1 > 0 && distanceSlot1 < 15);
        doc["slot2"] = (distanceSlot2 > 0 && distanceSlot2 < 15);
        doc["slot3"] = (distanceSlot3 > 0 && distanceSlot3 < 15);

        // Detailed sensor data
        JsonObject sensorData = doc.createNestedObject("sensorData");
        sensorData["distance1"] = distanceSlot1;
        sensorData["distance2"] = distanceSlot2;
        sensorData["distance3"] = distanceSlot3;
        sensorData["ldr1"] = LDR_1Value;
        sensorData["ldr2"] = LDR_2Value;
        sensorData["ldr3"] = LDR_3Value;

        // Double parking detection
        doc["doubleParkingMid1"] = (LDR_MID1Value < 1000);
        doc["doubleParkingMid2"] = (LDR_MID2Value < 1000);

        // System status
        doc["availableSlots"] = slots;
        doc["entryGateStatus"] = (flag1 == 1);
        doc["exitGateStatus"] = (flag2 == 1);

        String jsonString;
        serializeJson(doc, jsonString);

        // Send POST request
        int httpResponseCode = http.POST(jsonString);

        if (httpResponseCode > 0)
        {
            String response = http.getString();
            Serial.println("HTTP Response: " + response);
        }
        else
        {
            Serial.println("Error sending HTTP POST: " + String(httpResponseCode));
        }

        http.end();
    }
    else
    {
        Serial.println("WiFi not connected");
    }
}

void setup()
{
    // Initialize Serial Monitor
    Serial.begin(115200);

    // Connect to WiFi
    WiFi.begin(ssid, password);
    Serial.println("Connecting to WiFi");
    while (WiFi.status() != WL_CONNECTED)
    {
        delay(500);
        Serial.print(".");
    }
    Serial.println("\nConnected to WiFi");
    Serial.print("IP Address: ");
    Serial.println(WiFi.localIP());

    // Your existing setup code
    pinMode(LED_PIN, OUTPUT);
    pinMode(LDR_PIN1, OUTPUT);
    pinMode(LDR_PIN2, OUTPUT);
    pinMode(LDR_PIN3, OUTPUT);
    pinMode(LDR_PIN_MID1, OUTPUT);
    pinMode(LDR_PIN_MID2, OUTPUT);
    pinMode(BUZZER_PIN, OUTPUT);

    digitalWrite(LED_PIN, LOW);
    digitalWrite(BUZZER_PIN, LOW);

    myservo.attach(21);
    myservo.write(0);
}

void loop()
{
    // ---- Entry/Exit Control ---- //
    distanceEntry = sonarEntry.ping_cm();
    Serial.print("Entry Distance: ");
    Serial.println(distanceEntry);

    if (distanceEntry > 0 && distanceEntry < 15 && flag1 == 0)
    {
        if (slots > 0)
        {
            flag1 = 1;
            if (flag2 == 0)
            {
                myservo.write(90);
                slots = slots - 1;
            }
        }
        else
        {
            Serial.print("Sorry, parking full! ");
            Serial.println();
        }
        Serial.print("Slots:");
        Serial.println(slots);
    }

    distanceExit = sonarExit.ping_cm();
    Serial.print("Exit Distance: ");
    Serial.println(distanceExit);

    if (distanceExit > 0 && distanceExit < 15 && flag2 == 0)
    {
        flag2 = 1;
        if (flag1 == 0)
        {
            myservo.write(90);
            slots = slots + 1;
        }
        Serial.print("Slots:");
        Serial.println(slots);
    }

    if (flag1 == 1 && flag2 == 1)
    {
        delay(1000);
        myservo.write(0);
        flag1 = 0;
        flag2 = 0;
    }

    // ---- Slot Occupancy Detection ---- //
    distanceSlot1 = sonar1.ping_cm();
    Serial.print("Slot 1 Distance: ");
    Serial.println(distanceSlot1);
    LDR_1Value = analogRead(LDR_PIN1);
    Serial.print("LDR1 Value: ");
    Serial.println(LDR_1Value);

    if (distanceSlot1 > 0 && distanceSlot1 < 15)
    {
        Serial.println("Slot 1 Occupied.");
        Serial.println();
    }
    else
    {
        Serial.println("Slot 1 Free.");
        Serial.println();
    }

    distanceSlot2 = sonar2.ping_cm();
    Serial.print("Slot 2 Distance: ");
    Serial.println(distanceSlot2);
    LDR_2Value = analogRead(LDR_PIN2);
    Serial.print("LDR2 Value: ");
    Serial.println(LDR_2Value);

    if (distanceSlot2 > 0 && distanceSlot2 < 15)
    {
        Serial.println("Slot 2 Occupied.");
        Serial.println();
    }
    else
    {
        Serial.println("Slot 2 Free.");
        Serial.println();
    }

    distanceSlot3 = sonar3.ping_cm();
    Serial.print("Slot 3 Distance: ");
    Serial.println(distanceSlot3);
    LDR_3Value = analogRead(LDR_PIN3);
    Serial.print("LDR Value: ");
    Serial.println(LDR_3Value);

    if (distanceSlot3 > 0 && distanceSlot3 < 15)
    {
        Serial.println("Slot 3 Occupied.");
        Serial.println();
    }
    else
    {
        Serial.println("Slot 3 Free.");
        Serial.println();
    }

    // ---- Double Parking Detection ---- //
    LDR_MID1Value = analogRead(LDR_PIN_MID1);
    Serial.print("LDR Mid1 Value: ");
    Serial.println(LDR_MID1Value);

    if (LDR_MID1Value < 1000)
    {
        digitalWrite(BUZZER_PIN, HIGH);
        Serial.println("Double Parking Detected: Slots 1 & 2!");
        Serial.println();
        delay(2000);
        digitalWrite(BUZZER_PIN, LOW);
    }
    else
    {
        digitalWrite(BUZZER_PIN, LOW);
    }

    LDR_MID2Value = analogRead(LDR_PIN_MID2);
    Serial.print("LDR Mid2 Value: ");
    Serial.println(LDR_MID2Value);

    if (LDR_MID2Value < 1000)
    {
        digitalWrite(BUZZER_PIN, HIGH);
        Serial.println("Double Parking Detected: Slots 2 & 3!");
        Serial.println();
        delay(2000);
        digitalWrite(BUZZER_PIN, LOW);
    }
    else
    {
        digitalWrite(BUZZER_PIN, LOW);
    }

    if (distanceSlot1 > 0 && distanceSlot1 < 30 ||
        distanceSlot2 > 0 && distanceSlot2 < 30 ||
        distanceSlot3 > 0 && distanceSlot3 < 30)
    {
        digitalWrite(LED_PIN, HIGH);
    }

    // Send data to web server
    sendDataToServer();

    delay(2000);
}