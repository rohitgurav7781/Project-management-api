# Project Setup

## Prerequisites
Ensure you have the following installed before setting up the project:

- **Node.js**: `v20.11.0` or can go with latest version also
- **MongoDB**: Running locally or via a cloud provider (e.g., MongoDB Atlas)

## Installation

1. Clone the repository:
   ```sh
   git clone <repository-url>
   cd <project-folder>
   ```
2. Install dependencies:
   ```sh
   npm install
   ```
3. Set up the environment variables:
   - A `.env` file has been provided. Ensure you update the necessary values before running the application.

## Database Models Requiring Manual Updates
Certain collections in MongoDB need to be updated manually. These include:
- `options`
- `tag`
- `locationDatas`
- `state`
- `district`
- `notification_templates`

Ensure that these collections contain the required data before using the application.

## Running the Project

Start the development server:
```sh
npm run dev
```

For production, use:
```sh
npm start
```

## Additional Notes
- Make sure MongoDB is running and accessible.
- Review logs for any missing environment variables or database setup issues.

For any issues, refer to the project documentation or contact the development team.

