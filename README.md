## Technical Overview

[Read the technical and business guide on Dotabod](/TechnicalOverview.md)

## 🚀 Setup Guide

To set up the Dotabod backend services, follow these steps:

1. Install `docker`.
2. Set up a free Supabase account at <https://app.supabase.com/>.
3. Set up a free Twitch Developer app to get a client ID and secret from <https://dev.twitch.tv/console/apps/>.
4. Copy the example environment file: `cp .env.example .env` and update the variables with your Supabase and Twitch credentials.
5. Run `yarn just update` to start the services, and you're ready to get started! 🚀

## 🛠️ Services

- `dota`: Contains code related to Dota 2 data processing. 🧙‍♂️
- `twitch`: Contains code for the Twitch chat bot and event handling. 💬
- `settings`: Contains configuration settings for the services. ⚙️
- `mongodb`: Contains code for MongoDB database interactions. 🗄️
- `services`: Contains additional services, such as backups and crowdin. 📦

## 📊 Analytics

![Alt](https://repobeats.axiom.co/api/embed/943063b4aa73d534ab5d3c1a2f2406c1bf73ba1a.svg "Repobeats analytics image")

## 📄 License

This project is licensed under the terms of the [LICENSE](LICENSE) file.

## 🤝 Contributing

Contributions are welcome! Please read the [CONTRIBUTING.md](CONTRIBUTING.md) file for guidelines on how to contribute to this project.
